import { z } from "zod";

export const eventIdParamsSchema = z.object({
    id: z.uuid()
});

export const listEventsQuerySchema = z.object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const eventResponseSchema = z.object({
    id: z.uuid(),
    name: z.string().min(1),
    startsAt: z.iso.datetime(),
    createdAt: z.iso.datetime()
});

export const eventSeatResponseSchema = z.object({
    id: z.uuid(),
    eventId: z.uuid(),
    rowLabel: z.string().min(1),
    seatNumber: z.number().int().positive(),
    priceCents: z.number().int().nonnegative(),
    version: z.number().int().nonnegative()
});

export const listEventsResponseSchema = z.object({
    events: z.array(eventResponseSchema),
    nextCursor: z.uuid().nullable()
});

export const eventSeatsResponseSchema = z.object({
    eventId: z.uuid(),
    seats: z.array(eventSeatResponseSchema)
});
