import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
    DATABASE_URL: z.string().url(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
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
    PAYMENT_PROVIDER_API_URL: z.string().url(),
    PUBLIC_WEBHOOK_URL: z.string().url().optional()
});

const parsedConfig = configSchema.safeParse(process.env);

if (!parsedConfig.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsedConfig.error)}`);
}

export const config = Object.freeze({
    databaseUrl: parsedConfig.data.DATABASE_URL,
    nodeEnv: parsedConfig.data.NODE_ENV,
    port: parsedConfig.data.PORT,
    rabbitMqUrl: parsedConfig.data.RABBITMQ_URL,
    rabbitMqExchange: parsedConfig.data.RABBITMQ_EXCHANGE,
    rabbitMqNotificationQueue: parsedConfig.data.RABBITMQ_NOTIFICATION_QUEUE,
    rabbitMqNotificationDeadLetterQueue: parsedConfig.data.RABBITMQ_NOTIFICATION_DLQ,
    rabbitMqNotificationRetryOneMinuteQueue:
        parsedConfig.data.RABBITMQ_NOTIFICATION_RETRY_1M_QUEUE,
    rabbitMqNotificationRetryFiveMinuteQueue:
        parsedConfig.data.RABBITMQ_NOTIFICATION_RETRY_5M_QUEUE,
    paymentProviderApiUrl: parsedConfig.data.PAYMENT_PROVIDER_API_URL,
    publicWebhookUrl: parsedConfig.data.PUBLIC_WEBHOOK_URL
});