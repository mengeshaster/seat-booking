import type { PaymentProvider } from "../payment.provider.js";

/**
 * A deterministic fake payment provider for testing.
 * Can be instructed to return failed or paid status, or always succeed.
 */
export class FakePaymentProvider implements PaymentProvider {
    private static instance: FakePaymentProvider;
    private forceFail: boolean = false;
    private forcePaid: boolean = false;

    private paymentStore = new Map<
        string,
        {
            status: "pending" | "paid" | "failed";
            providerPayload: any;
        }
    >();

    private constructor() { }

    static getInstance(): FakePaymentProvider {
        if (!FakePaymentProvider.instance) {
            FakePaymentProvider.instance = new FakePaymentProvider();
        }
        return FakePaymentProvider.instance;
    }

    /**
     * Deterministically tells the provider to fail subsequent payments.
     */
    setFail(value: boolean) {
        this.forceFail = value;
    }

    /**
     * Deterministically tells the provider to mark payments as paid.
     */
    setPaid(value: boolean) {
        this.forcePaid = value;
    }

    /**
     * Resets all fakes and flags.
     */
    reset() {
        this.forceFail = false;
        this.forcePaid = false;
        this.paymentStore.clear();
    }

    async authorize(params: {
        bookingId: string;
        userId: string;
        amountCents: number;
        idempotencyKey: string;
    }): Promise<{
        authorizationId: string;
        providerPayload: unknown;
    }> {
        // Use idempotencyKey for paymentId to ensure deterministic idempotency
        const paymentId = params.idempotencyKey;

        let status: "pending" | "paid" | "failed" = "pending";
        if (this.forceFail) {
            status = "failed";
        } else if (this.forcePaid) {
            status = "paid";
        }

        const providerPayload = {
            test: true,
            amountCents: params.amountCents,
            bookingId: params.bookingId,
            userId: params.userId,
            note: "Fake payment provider"
        };

        this.paymentStore.set(paymentId, {
            status,
            providerPayload
        });

        return {
            authorizationId: paymentId,
            providerPayload
        };
    }

    async voidAuthorization(authorizationId: string): Promise<void> {
        this.paymentStore.delete(authorizationId);
    }

    async getPaymentStatus(paymentId: string): Promise<{
        status: "pending" | "paid" | "failed";
        providerPayload: unknown;
    }> {
        const result = this.paymentStore.get(paymentId);
        if (!result) {
            // Simulate not found as failed for determinism
            return {
                status: "failed",
                providerPayload: { error: "Not found", paymentId }
            };
        }
        return result;
    }
}

// Export a singleton instance for application use/testing convenience
export const fakePaymentProvider = FakePaymentProvider.getInstance();
