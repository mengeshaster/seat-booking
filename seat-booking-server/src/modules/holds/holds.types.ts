import type { z } from "zod";
import type {
    createHoldBodySchema,
    holdIdParamsSchema,
    holdResponseSchema,
    holdSeatResponseSchema,
    holdSeatsResponseSchema,
    holdStatusSchema
} from "./holds.schema.js";

export type HoldId = string;
export type SeatId = string;

export type HoldStatus = "active" | "released" | "expired" | "confirmed";

export interface Hold {
    id: HoldId;
    eventId: string;
    userId: string;
    status: HoldStatus;
    expiresAt: Date;
    createdAt: Date;
}

export interface HoldSeat {
    holdId: HoldId;
    seatId: SeatId;
    holdStatus: HoldStatus;
    lockedSeatId: SeatId | null;
}

export type HoldIdParams = z.infer<typeof holdIdParamsSchema>;
export type CreateHoldBody = z.infer<typeof createHoldBodySchema>;
export type HoldStatusValue = z.infer<typeof holdStatusSchema>;
export type HoldResponse = z.infer<typeof holdResponseSchema>;
export type HoldSeatResponse = z.infer<typeof holdSeatResponseSchema>;
export type HoldSeatsResponse = z.infer<typeof holdSeatsResponseSchema>;

export type BookingConfirmation = {
    id: string;
    holdId: string;
    userId: string;
    amountCents: number;
    status: "pending";
    authorizationId: string;
};

export type ConfirmationResult = {
    booking: BookingConfirmation;
    replayed: boolean;
};

export type AuthorizationContext = {
    userId: string;
    amountCents: number;
};

export interface HoldsRepository {
    create(input: {
        eventId: string;
        userId: string;
        seatIds: SeatId[];
        expiresAt: Date;
    }): Promise<HoldResponse>;
    findById(id: HoldId): Promise<HoldResponse | null>;
    findSeats(holdId: HoldId): Promise<HoldSeatResponse[]>;
    updateStatus(id: HoldId, status: HoldStatus): Promise<HoldResponse | null>;
    delete(id: HoldId): Promise<void>;
    withIdempotencyLock<T>(idempotencyKey: string, operation: () => Promise<T>): Promise<T>;
    findConfirmationByIdempotencyKey(idempotencyKey: string): Promise<BookingConfirmation | null>;
    getAuthorizationContext(id: HoldId): Promise<AuthorizationContext>;
    confirm(input: {
        holdId: HoldId;
        idempotencyKey: string;
        bookingId: string;
        authorizationId: string;
        amountCents: number;
    }): Promise<ConfirmationResult>;
    expireBatch(limit: number): Promise<HoldId[]>;
}
