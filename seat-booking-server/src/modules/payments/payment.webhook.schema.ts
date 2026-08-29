import { z } from "zod";

export const paymentWebhookSchema = z.object({
    providerEventId: z.string().min(1),
    bookingId: z.uuid(),
    occurredAt: z.iso.datetime(),
    payload: z.json()
});

export const paymentEventResponseSchema = z.object({
    providerEventId: z.string().min(1),
    bookingId: z.uuid(),
    occurredAt: z.iso.datetime(),
    receivedAt: z.iso.datetime(),
    payload: z.json()
});
