import { paymentEventsRepository } from "./payment.repository.js";
import type {
    PaymentEvent,
    PaymentEventResponse,
    PaymentSettlementOutcome,
    PaymentWebhookInput
} from "./payment.webhook.types.js";

const toPaymentEventResponse = (event: PaymentEvent): PaymentEventResponse => ({
    providerEventId: event.providerEventId,
    bookingId: event.bookingId,
    occurredAt: event.occurredAt.toISOString(),
    receivedAt: event.receivedAt.toISOString(),
    payload: event.payload
});

export async function receivePaymentWebhook(input: PaymentWebhookInput): Promise<{
    event: PaymentEventResponse;
    outcome: PaymentSettlementOutcome;
}> {
    const result = await paymentEventsRepository.createIfAbsentAndApply(input);

    return {
        event: toPaymentEventResponse(result.event),
        outcome: result.outcome
    };
}
