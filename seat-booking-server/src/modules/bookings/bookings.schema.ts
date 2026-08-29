import { z } from "zod";

export const bookingStatusSchema = z.enum(["pending", "paid", "failed"]);

export const idempotencyKeyQuerySchema = z.object({
    idempotencyKey: z.string().min(1).max(128)
});

export const bookingSchema = z.object({
    id: z.string().uuid(),
    holdId: z.string().uuid(),
    userId: z.string().uuid(),
    amountCents: z.number().int().nonnegative(),
    status: bookingStatusSchema,
    idempotencyKey: z.string(),
    responseBody: z.unknown(),
    createdAt: z.coerce.date()
});

export const createBookingBodySchema = z.object({
    holdId: z.string().uuid(),
    userId: z.string().uuid(),
    amountCents: z.number().int().nonnegative(),
    status: bookingStatusSchema,
    idempotencyKey: z.string(),
    responseBody: z.unknown(),
});

export const bookingIdParamsSchema = z.object({
    id: z.string().uuid()
});