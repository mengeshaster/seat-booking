import {
    BOOKING_CONFIRMED_EVENT,
    assertNotificationTopology,
    connectRabbit,
    parseBookingConfirmedMessage,
    type RabbitConnection
} from "@seat-booking/messaging";
import { logger } from "@seat-booking/observability";
import type { ConsumeMessage } from "amqplib";
import { config } from "./config.js";
import { connectDatabase, disconnectDatabase } from "./db.js";
import {
    isDeliverySent,
    markDeliveryFailed,
    markDeliveryProcessing,
    markDeliverySent
} from "./deliveries.repository.js";
import { sendBookingConfirmation } from "./mail.js";

const MAX_RETRY_ATTEMPTS = 2;

function retryCount(message: ConsumeMessage): number {
    const value = message.properties.headers?.["x-retry-count"];
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

async function retryOrDeadLetter(
    rabbit: RabbitConnection,
    message: ConsumeMessage,
    error: unknown
): Promise<void> {
    const retries = retryCount(message);

    if (retries >= MAX_RETRY_ATTEMPTS) {
        rabbit.channel.nack(message, false, false);
        logger.error("notification.dead_lettered", {
            messageId: message.properties.messageId,
            retries,
            error
        });
        return;
    }

    const retryQueue =
        retries === 0
            ? config.messaging.notificationRetryOneMinuteQueue
            : config.messaging.notificationRetryFiveMinuteQueue;
    const published = rabbit.channel.sendToQueue(retryQueue, message.content, {
        contentType: message.properties.contentType,
        contentEncoding: message.properties.contentEncoding,
        deliveryMode: 2,
        messageId: message.properties.messageId,
        timestamp: message.properties.timestamp,
        headers: {
            ...message.properties.headers,
            "x-retry-count": retries + 1
        }
    });

    if (!published) {
        throw new Error(`Retry queue ${retryQueue} is unavailable`);
    }

    rabbit.channel.ack(message);
    logger.warn("notification.retry_scheduled", {
        messageId: message.properties.messageId,
        retries: retries + 1,
        retryQueue
    });
}

async function processMessage(rabbit: RabbitConnection, message: ConsumeMessage): Promise<void> {
    let envelope: any;

    try {
        envelope = parseBookingConfirmedMessage(message);
    } catch (error) {
        logger.error("notification.invalid_message", {
            messageId: message.properties.messageId,
            error
        });
        rabbit.channel.nack(message, false, false);
        return;
    }

    if (await isDeliverySent(envelope.id)) {
        rabbit.channel.ack(message);
        logger.info("notification.duplicate_ignored", { messageId: envelope.id });
        return;
    }

    try {
        await markDeliveryProcessing(
            envelope.id,
            envelope.payload.recipient.email,
            BOOKING_CONFIRMED_EVENT
        );
        await sendBookingConfirmation(envelope.payload);
        await markDeliverySent(envelope.id);
        rabbit.channel.ack(message);
        logger.info("notification.sent", {
            messageId: envelope.id,
            recipient: envelope.payload.recipient.email
        });
    } catch (error) {
        await markDeliveryFailed(envelope.id, error).catch((persistenceError) => {
            logger.error("notification.failure_not_persisted", {
                messageId: envelope.id,
                error: persistenceError
            });
        });
        await retryOrDeadLetter(rabbit, message, error);
    }
}

async function start(): Promise<void> {
    await connectDatabase();
    const rabbit = await connectRabbit(config.messaging.url);
    await assertNotificationTopology(rabbit.channel, config.messaging);
    await rabbit.channel.prefetch(10);

    const consumer = await rabbit.channel.consume(
        config.messaging.notificationQueue,
        (message) => {
            if (message) {
                void processMessage(rabbit, message).catch((error) => {
                    logger.error("notification.unhandled_message_error", { error });
                });
            }
        },
        { noAck: false }
    );

    logger.info("notification_consumer.started", {
        queue: config.messaging.notificationQueue,
        consumerTag: consumer.consumerTag
    });

    let isShuttingDown = false;
    const shutdown = async (signal: NodeJS.Signals) => {
        if (isShuttingDown) {
            return;
        }

        isShuttingDown = true;
        logger.info("notification_consumer.stopping", { signal });
        await rabbit.channel.cancel(consumer.consumerTag).catch(() => undefined);
        await rabbit.channel.close().catch(() => undefined);
        await rabbit.connection.close().catch(() => undefined);
        await disconnectDatabase();
        process.exit(0);
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((error) => {
    logger.error("notification_consumer.start_failed", { error });
    process.exit(1);
});
