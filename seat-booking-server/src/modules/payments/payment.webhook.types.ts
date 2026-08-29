import type { z } from "zod";
import type {
    paymentEventResponseSchema,
    paymentWebhookSchema
} from "./payment.webhook.schema.js";

export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

export interface PaymentEvent {
    providerEventId: string;
    bookingId: string;
    occurredAt: Date;
    receivedAt: Date;
    payload: JsonValue;
}

export type PaymentWebhookInput = z.infer<typeof paymentWebhookSchema>;
export type PaymentEventResponse = z.infer<typeof paymentEventResponseSchema>;

export type PaymentSettlementOutcome = "applied" | "duplicate" | "outOfOrder";

export interface PaymentEventsRepository {
    createIfAbsentAndApply(input: PaymentWebhookInput): Promise<{
        event: PaymentEvent;
        outcome: PaymentSettlementOutcome;
    }>;
}
