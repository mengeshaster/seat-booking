import { z } from "zod";

export const holdStatusSchema = z.enum(["active", "released", "expired", "confirmed"]);

export const idempotencyKeyHeaderSchema = z.object({
    "Idempotency-Key": z.string().min(1).max(128)
});

export const holdIdParamsSchema = z.object({
    id: z.uuid()
});

export const createHoldBodySchema = z.object({
    userId: z.uuid(),
    seatIds: z
        .array(z.uuid())
        .min(1, "At least one seat is required.")
        .max(20, "A hold can contain at most 20 seats.")
        .refine((seatIds) => new Set(seatIds).size === seatIds.length, {
            message: "Seat IDs must be unique."
        })
});

export const holdResponseSchema = z.object({
    id: z.uuid(),
    eventId: z.uuid(),
    userId: z.uuid(),
    status: holdStatusSchema,
    expiresAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    seatIds: z.array(z.uuid())
});

export const holdSeatResponseSchema = z.object({
    holdId: z.uuid(),
    seatId: z.uuid(),
    holdStatus: holdStatusSchema
});

export const holdSeatsResponseSchema = z.object({
    holdId: z.uuid(),
    seats: z.array(holdSeatResponseSchema)
});