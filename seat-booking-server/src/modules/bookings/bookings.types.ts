import type { z } from "zod";
import { bookingIdParamsSchema, bookingSchema, createBookingBodySchema } from "./bookings.schema.js";

export type BookingId = string;
export type HoldId = string;
export type UserId = string;

export type BookingStatus = "pending" | "paid" | "failed";

export interface Booking {
    id: BookingId;
    holdId: HoldId;
    userId: UserId;
    amountCents: number;
    status: BookingStatus;
    idempotencyKey: string;
    responseBody: unknown; // as stored in JSONB, could specify type if domain expects shape
    createdAt: Date;
}

export type BookingResponse = z.infer<typeof bookingSchema>;
export type CreateBookingBody = z.infer<typeof createBookingBodySchema>;
export type BookingIdParams = z.infer<typeof bookingIdParamsSchema>;

export interface BookingsRepository {
    create(input: CreateBookingBody): Promise<BookingResponse>;
    findById(id: BookingId): Promise<BookingResponse | null>;
    findByIdempotencyKey(key: string): Promise<BookingResponse | null>;
    updateStatus(id: BookingId, status: BookingStatus): Promise<BookingResponse | null>;
    delete(id: BookingId): Promise<void>;
}