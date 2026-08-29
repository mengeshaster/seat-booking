import "dotenv/config";
import { z } from "zod";
import type { MessagingConfig } from "@seat-booking/messaging";

const configSchema = z.object({
    DATABASE_URL: z.string().url(),
    RABBITMQ_URL: z.string().url().default("amqp://localhost"),
    RABBITMQ_EXCHANGE: z.string().min(1).default("seat-booking.events"),
    RABBITMQ_NOTIFICATION_QUEUE: z.string().min(1).default("seat-booking.notifications"),
    RABBITMQ_NOTIFICATION_DLQ: z.string().min(1).default("seat-booking.notifications.dlq"),
    RABBITMQ_NOTIFICATION_RETRY_1M_QUEUE: z
        .string()
        .min(1)
        .default("seat-booking.notifications.retry.1m"),
    RABBITMQ_NOTIFICATION_RETRY_5M_QUEUE: z
        .string()
        .min(1)
        .default("seat-booking.notifications.retry.5m"),
    SMTP_HOST: z.string().min(1).default("localhost"),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    SMTP_FROM: z.email().default("noreply@seat-booking.local")
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
}

export const config = Object.freeze({
    databaseUrl: parsed.data.DATABASE_URL,
    smtpHost: parsed.data.SMTP_HOST,
    smtpPort: parsed.data.SMTP_PORT,
    smtpFrom: parsed.data.SMTP_FROM,
    messaging: {
        url: parsed.data.RABBITMQ_URL,
        exchange: parsed.data.RABBITMQ_EXCHANGE,
        notificationQueue: parsed.data.RABBITMQ_NOTIFICATION_QUEUE,
        notificationDeadLetterQueue: parsed.data.RABBITMQ_NOTIFICATION_DLQ,
        notificationRetryOneMinuteQueue: parsed.data.RABBITMQ_NOTIFICATION_RETRY_1M_QUEUE,
        notificationRetryFiveMinuteQueue: parsed.data.RABBITMQ_NOTIFICATION_RETRY_5M_QUEUE
    } satisfies MessagingConfig
});
