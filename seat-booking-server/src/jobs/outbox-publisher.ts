import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import {
    BOOKING_CONFIRMED_EVENT,
    assertNotificationTopology,
    isBookingConfirmedEnvelope,
    type EventEnvelope,
    type MessagingConfig
} from "@seat-booking/messaging";
import { logger } from "@seat-booking/observability";
import { config } from "../shared/config.js";
import { connectDatabase, disconnectDatabase, withTransaction } from "../shared/db.js";

const PUBLISH_INTERVAL_MS = 1_000;
const PUBLISH_BATCH_SIZE = 100;
const RECONNECT_DELAY_MS = 5_000;
const messagingConfig: MessagingConfig = {
    url: config.rabbitMqUrl,
    exchange: config.rabbitMqExchange,
    notificationQueue: config.rabbitMqNotificationQueue,
    notificationDeadLetterQueue: config.rabbitMqNotificationDeadLetterQueue,
    notificationRetryOneMinuteQueue: config.rabbitMqNotificationRetryOneMinuteQueue,
    notificationRetryFiveMinuteQueue: config.rabbitMqNotificationRetryFiveMinuteQueue
};

type OutboxRow = {
    id: string;
    aggregateId: string;
    eventType: string;
    payload: unknown;
    createdAt: Date;
};

export async function publishOutboxBatch(
    channel: ConfirmChannel,
    batchSize: number = PUBLISH_BATCH_SIZE
): Promise<number> {
    return withTransaction(async (client) => {
        const outboxRows = await client.query<OutboxRow>(
            `
                SELECT
                    id,
                    aggregate_id AS "aggregateId",
                    event_type AS "eventType",
                    payload,
                    created_at AS "createdAt"
                FROM outbox
                WHERE published_at IS NULL
                ORDER BY id ASC
                FOR UPDATE SKIP LOCKED
                LIMIT $1
            `,
            [batchSize]
        );

        if (outboxRows.rows.length === 0) {
            return 0;
        }

        for (const row of outboxRows.rows) {
            const envelope: EventEnvelope = {
                id: row.id,
                aggregateId: row.aggregateId,
                eventType: row.eventType,
                payload: row.payload,
                createdAt: row.createdAt.toISOString()
            };

            if (
                envelope.eventType === BOOKING_CONFIRMED_EVENT &&
                !isBookingConfirmedEnvelope(envelope)
            ) {
                throw new Error(`Invalid ${BOOKING_CONFIRMED_EVENT} outbox event ${row.id}`);
            }

            const message = JSON.stringify(envelope);

            channel.publish(
                config.rabbitMqExchange,
                row.eventType,
                Buffer.from(message),
                {
                    contentType: "application/json",
                    deliveryMode: 2,
                    messageId: row.id,
                    timestamp: Math.floor(row.createdAt.getTime() / 1000)
                }
            );
        }

        await channel.waitForConfirms();
        const outboxIds = outboxRows.rows.map((row) => row.id);

        await client.query(
            `
                UPDATE outbox
                SET published_at = now()
                WHERE id = ANY($1::bigint[])
            `,
            [outboxIds]
        );

        logger.info("outbox.published", {
            count: outboxIds.length,
            outboxIds
        });

        return outboxIds.length;
    });
}

function startOutboxPublishLoop(
    channel: ConfirmChannel,
    intervalMs: number = PUBLISH_INTERVAL_MS
): () => void {
    let isRunning = false;

    const tick = async () => {
        if (isRunning) {
            return;
        }

        isRunning = true;

        try {
            await publishOutboxBatch(channel);
        } catch (error) {
            logger.error("outbox_publisher.failed", { error });
        } finally {
            isRunning = false;
        }
    };

    void tick();
    const timer = setInterval(() => void tick(), intervalMs);

    return () => clearInterval(timer);
}

export function startOutboxPublisher(
    intervalMs: number = PUBLISH_INTERVAL_MS
): () => Promise<void> {
    let isStopped = false;
    let connection: ChannelModel | undefined;
    let channel: ConfirmChannel | undefined;
    let stopLoop: (() => void) | undefined;
    let reconnectTimer: NodeJS.Timeout | undefined;

    const closeResources = async () => {
        stopLoop?.();
        stopLoop = undefined;

        await channel?.close().catch(() => undefined);
        await connection?.close().catch(() => undefined);
        channel = undefined;
        connection = undefined;
    };

    const scheduleReconnect = () => {
        if (isStopped || reconnectTimer) {
            return;
        }

        reconnectTimer = setTimeout(() => {
            reconnectTimer = undefined;
            void connectAndStart();
        }, RECONNECT_DELAY_MS);
    };

    const connectAndStart = async (): Promise<void> => {
        try {
            connection = await connect(config.rabbitMqUrl);
            connection.on("error", (error) => {
                logger.error("outbox_publisher.connection_failed", { error });
            });
            connection.on("close", () => {
                void closeResources();
                logger.warn("outbox_publisher.connection_closed");
                scheduleReconnect();
            });

            channel = await connection.createConfirmChannel();
            await assertNotificationTopology(channel, messagingConfig);
            channel.on("error", (error) => {
                logger.error("outbox_publisher.channel_failed", { error });
            });

            stopLoop = startOutboxPublishLoop(channel, intervalMs);
            logger.info("outbox_publisher.started", {
                exchange: config.rabbitMqExchange,
                intervalMs,
                batchSize: PUBLISH_BATCH_SIZE
            });
        } catch (error) {
            logger.error("outbox_publisher.connection_failed", { error });
            await closeResources();
            scheduleReconnect();
        }
    };

    void connectAndStart();

    return async () => {
        isStopped = true;

        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
        }

        await closeResources();
    };
}

async function runStandalone(): Promise<void> {
    await connectDatabase();
    const stop = startOutboxPublisher();

    const shutdown = async (signal: NodeJS.Signals) => {
        logger.info("outbox_publisher.stopping", { signal });
        await stop();
        await disconnectDatabase();
        process.exit(0);
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

const isStandalone =
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isStandalone) {
    runStandalone().catch((error) => {
        logger.error("outbox_publisher.start_failed", { error });
        process.exit(1);
    });
}
