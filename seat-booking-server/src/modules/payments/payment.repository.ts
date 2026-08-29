import { pool, withTransaction } from "../../shared/db.js";
import type {
    PaymentEvent,
    PaymentEventsRepository,
    PaymentWebhookInput
} from "./payment.webhook.types.js";

type PaymentEventRow = {
    providerEventId: string;
    bookingId: string;
    occurredAt: Date;
    receivedAt: Date;
    payload: unknown;
};

const toPaymentEvent = (row: PaymentEventRow): PaymentEvent => ({
    providerEventId: row.providerEventId,
    bookingId: row.bookingId,
    occurredAt: row.occurredAt,
    receivedAt: row.receivedAt,
    payload: row.payload as PaymentEvent["payload"]
});

export const paymentEventsRepository: PaymentEventsRepository = {
    async createIfAbsentAndApply(input: PaymentWebhookInput) {
        return withTransaction(async (client) => {
            const inserted = await client.query<PaymentEventRow>(
            `
                INSERT INTO payment_events (
                    provider_event_id,
                    booking_id,
                    occurred_at,
                    payload
                )
                VALUES ($1, $2, $3, $4::jsonb)
                ON CONFLICT (provider_event_id) DO NOTHING
                RETURNING
                    provider_event_id AS "providerEventId",
                    booking_id AS "bookingId",
                    occurred_at AS "occurredAt",
                    received_at AS "receivedAt",
                    payload
            `,
                [
                    input.providerEventId,
                    input.bookingId,
                    input.occurredAt,
                    JSON.stringify(input.payload)
                ]
            );

            if (!inserted.rows[0]) {
                const existing = await client.query<PaymentEventRow>(
                    `
                        SELECT
                            provider_event_id AS "providerEventId",
                            booking_id AS "bookingId",
                            occurred_at AS "occurredAt",
                            received_at AS "receivedAt",
                            payload
                        FROM payment_events
                        WHERE provider_event_id = $1
                    `,
                    [input.providerEventId]
                );

                if (!existing.rows[0]) {
                    throw new Error("Payment event could not be persisted.");
                }

                return { event: toPaymentEvent(existing.rows[0]), outcome: "duplicate" as const };
            }

            const event = toPaymentEvent(inserted.rows[0]);
            const applied = await client.query(
                `
                    UPDATE bookings
                    SET
                        status = 'paid',
                        last_payment_applied_at = $2
                    WHERE id = $1
                      AND (
                          last_payment_applied_at IS NULL
                          OR last_payment_applied_at < $2
                      )
                `,
                [event.bookingId, event.occurredAt]
            );

            return {
                event,
                outcome: applied.rowCount === 1 ? ("applied" as const) : ("outOfOrder" as const)
            };
        });
    }
};
