export interface PaymentProvider {
    authorize(params: {
        bookingId: string;
        userId: string;
        amountCents: number;
        idempotencyKey: string;
    }): Promise<{
        authorizationId: string;
        providerPayload: unknown;
    }>;

    voidAuthorization(authorizationId: string): Promise<void>;

    getPaymentStatus(authorizationId: string): Promise<{
        status: "pending" | "paid" | "failed";
        providerPayload: unknown;
    }>;
}