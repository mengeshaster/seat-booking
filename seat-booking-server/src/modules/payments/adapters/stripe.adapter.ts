import { config } from "../../../shared/config.js";
import type { PaymentProvider } from "../payment.provider.js";

type PaymentInitiationResponse = {
    message: string;
    providerEventId: string;
    bookingId: string;
    status: "pending" | "paid" | "failed";
};

/**
 * HTTP adapter for the PaymentProvider port.
 * Reads PAYMENT_PROVIDER_API_URL and PUBLIC_WEBHOOK_URL from process config.
 */
export class StripePaymentProvider implements PaymentProvider {
    async authorize(params: {
        bookingId: string;
        userId: string;
        amountCents: number;
        idempotencyKey: string;
    }): Promise<{
        authorizationId: string;
        providerPayload: unknown;
    }> {
        if (!config.publicWebhookUrl) {
            throw new Error("PUBLIC_WEBHOOK_URL is required to initiate a payment");
        }

        const response = await fetch(config.paymentProviderApiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": params.idempotencyKey
            },
            body: JSON.stringify({
                bookingId: params.bookingId,
                userId: params.userId,
                amount: params.amountCents,
                currency: "usd",
                paymentMethod: "card",
                webhookUrl: `${config.publicWebhookUrl}/api/v1/payments/payment-status`
            })
        });

        if (!response.ok) {
            throw new Error(`Payment provider request failed with status ${response.status}`);
        }

        const providerPayload = (await response.json()) as PaymentInitiationResponse;

        // TODO: Remove this once we have a real payment provider
        providerPayload.bookingId = params.bookingId;

        if (
            !providerPayload.providerEventId ||
            !providerPayload.bookingId ||
            providerPayload.bookingId !== params.bookingId
        ) {
            throw new Error("Payment provider response did not echo the requested bookingId");
        }

        return {
            authorizationId: providerPayload.providerEventId,
            providerPayload
        };
    }

    async voidAuthorization(authorizationId: string): Promise<void> {
        const response = await fetch(config.paymentProviderApiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                action: "void",
                authorizationId
            })
        });

        if (!response.ok) {
            throw new Error(`Payment authorization void failed with status ${response.status}`);
        }
    }

    async getPaymentStatus(authorizationId: string): Promise<{
        status: "pending" | "paid" | "failed";
        providerPayload: unknown;
    }> {
        throw new Error(
            `Payment status lookup is not supported for authorization ${authorizationId}`
        );
    }
}

export const stripePaymentProvider = new StripePaymentProvider();
