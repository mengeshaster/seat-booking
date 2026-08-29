import { pool } from "./db.js";

type DeliveryStatus = "processing" | "sent" | "failed";

export async function isDeliverySent(messageId: string): Promise<boolean> {
    const result = await pool.query<{ status: DeliveryStatus }>(
        "SELECT status FROM notification_deliveries WHERE message_id = $1",
        [messageId]
    );

    return result.rows[0]?.status === "sent";
}

export async function markDeliveryProcessing(
    messageId: string,
    recipientEmail: string,
    notificationType: string
): Promise<void> {
    await pool.query(
        `
            INSERT INTO notification_deliveries (
                message_id, recipient_email, notification_type, status, attempts, updated_at
            )
            VALUES ($1, $2, $3, 'processing', 1, now())
            ON CONFLICT (message_id) DO UPDATE
            SET
                recipient_email = EXCLUDED.recipient_email,
                notification_type = EXCLUDED.notification_type,
                status = 'processing',
                attempts = notification_deliveries.attempts + 1,
                updated_at = now()
        `,
        [messageId, recipientEmail, notificationType]
    );
}

export async function markDeliverySent(messageId: string): Promise<void> {
    await pool.query(
        `
            UPDATE notification_deliveries
            SET status = 'sent', last_error = NULL, sent_at = now(), updated_at = now()
            WHERE message_id = $1
        `,
        [messageId]
    );
}

export async function markDeliveryFailed(messageId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
        `
            UPDATE notification_deliveries
            SET status = 'failed', last_error = $2, updated_at = now()
            WHERE message_id = $1
        `,
        [messageId, message]
    );
}
