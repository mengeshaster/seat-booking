import {
    connect,
    type Channel,
    type ChannelModel,
    type ConfirmChannel,
    type ConsumeMessage
} from "amqplib";

export const BOOKING_CONFIRMED_EVENT = "booking.confirmed" as const;

export type BookingConfirmedPayload = {
    version: 1;
    booking: {
        id: string;
        holdId: string;
        userId: string;
        amountCents: number;
        status: "pending" | "paid" | "failed";
    };
    recipient: {
        email: string;
        fullName: string;
    };
    event: {
        id: string;
        name: string;
        startsAt: string;
    };
    seats: Array<{
        id: string;
        rowLabel: string;
        seatNumber: number;
    }>;
};

export type EventEnvelope<TPayload = unknown> = {
    id: string;
    aggregateId: string;
    eventType: string;
    payload: TPayload;
    createdAt: string;
};

export type MessagingConfig = {
    url: string;
    exchange: string;
    notificationQueue: string;
    notificationDeadLetterQueue: string;
    notificationRetryOneMinuteQueue: string;
    notificationRetryFiveMinuteQueue: string;
};

export type RabbitConnection = {
    connection: ChannelModel;
    channel: Channel;
};

export async function connectRabbit(url: string): Promise<RabbitConnection> {
    const connection = await connect(url);
    const channel = await connection.createChannel();
    return { connection, channel };
}

export async function assertNotificationTopology(
    channel: Channel | ConfirmChannel,
    config: MessagingConfig
): Promise<void> {
    await channel.assertExchange(config.exchange, "topic", { durable: true });

    await channel.assertQueue(config.notificationDeadLetterQueue, { durable: true });
    await channel.bindQueue(
        config.notificationDeadLetterQueue,
        config.exchange,
        `${BOOKING_CONFIRMED_EVENT}.dead`
    );

    await channel.assertQueue(config.notificationQueue, {
        durable: true,
        deadLetterExchange: config.exchange,
        deadLetterRoutingKey: `${BOOKING_CONFIRMED_EVENT}.dead`
    });
    await channel.bindQueue(config.notificationQueue, config.exchange, BOOKING_CONFIRMED_EVENT);

    await assertRetryQueue(
        channel,
        config.notificationRetryOneMinuteQueue,
        60_000,
        config
    );
    await assertRetryQueue(
        channel,
        config.notificationRetryFiveMinuteQueue,
        300_000,
        config
    );
}

async function assertRetryQueue(
    channel: Channel | ConfirmChannel,
    queue: string,
    ttl: number,
    config: MessagingConfig
): Promise<void> {
    await channel.assertQueue(queue, {
        durable: true,
        arguments: {
            "x-message-ttl": ttl,
            "x-dead-letter-exchange": config.exchange,
            "x-dead-letter-routing-key": BOOKING_CONFIRMED_EVENT
        }
    });
    await channel.bindQueue(queue, config.exchange, queue);
}

export function parseBookingConfirmedMessage(
    message: ConsumeMessage
): EventEnvelope<BookingConfirmedPayload> {
    const parsed: unknown = JSON.parse(message.content.toString("utf8"));

    if (!isBookingConfirmedEnvelope(parsed)) {
        throw new Error("Invalid booking.confirmed message");
    }

    return parsed;
}

export function isBookingConfirmedEnvelope(
    value: unknown
): value is EventEnvelope<BookingConfirmedPayload> {
    if (!value || typeof value !== "object") {
        return false;
    }

    const envelope = value as Partial<EventEnvelope<BookingConfirmedPayload>>;
    const payload = envelope.payload;

    return (
        envelope.eventType === BOOKING_CONFIRMED_EVENT &&
        typeof envelope.id === "string" &&
        typeof envelope.aggregateId === "string" &&
        typeof envelope.createdAt === "string" &&
        !!payload &&
        payload.version === 1 &&
        typeof payload.recipient?.email === "string" &&
        typeof payload.recipient.fullName === "string" &&
        typeof payload.booking?.id === "string" &&
        Array.isArray(payload.seats)
    );
}
