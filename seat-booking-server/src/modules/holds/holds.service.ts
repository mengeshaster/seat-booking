import { randomUUID } from "node:crypto";
import { ConflictError, ValidationError } from "@seat-booking/errors";
import { stripePaymentProvider } from "../payments/adapters/stripe.adapter.js";
import { holdsRepository } from "./holds.repository.js";
import {
    ConfirmationResult,
    HoldId,
    HoldResponse,
    HoldSeatResponse,
    HoldStatus
} from "./holds.types.js";

export const createHold = async (input: {
    eventId: string;
    userId: string;
    seatIds: string[];
    expiresAt: Date;
}): Promise<HoldResponse> => {
    if (!input.eventId) {
        throw new ValidationError("Event id is required", undefined, "eventId");
    }
    if (!input.userId) {
        throw new ValidationError("User id is required", undefined, "userId");
    }
    if (!input.seatIds) {
        throw new ValidationError("Seat ids are required", undefined, "seatIds");
    }
    if (!input.expiresAt) {
        throw new ValidationError("Expires at is required", undefined, "expiresAt");
    }

    const hold = await holdsRepository.create(input);
    return hold;
};

export const getHoldById = async (id: HoldId): Promise<HoldResponse> => {
    if (!id) {
        throw new ValidationError("Hold id is required", undefined, "holdId");
    }

    const hold = await holdsRepository.findById(id);
    if (!hold) {
        throw new Error("Hold not found");
    }
    return hold;
};

export const getHoldSeats = async (holdId: HoldId): Promise<HoldSeatResponse[]> => {
    if (!holdId) {
        throw new ValidationError("Hold id is required", undefined, "holdId");
    }

    const seats = await holdsRepository.findSeats(holdId);
    return seats;
};

export const updateHoldStatus = async (id: HoldId, status: HoldStatus): Promise<HoldResponse | null> => {
    if (!id) {
        throw new ValidationError("Hold id is required", undefined, "holdId");
    }
    if (!status) {
        throw new ValidationError("Status is required", undefined, "status");
    }

    const hold = await holdsRepository.updateStatus(id, status);
    return hold;
};

export const deleteHold = async (id: HoldId): Promise<void> => {
    await holdsRepository.delete(id);
};

export const confirmHold = async (
    id: HoldId,
    idempotencyKey: string
): Promise<ConfirmationResult> => {
    if (!id) {
        throw new ValidationError("Hold id is required", undefined, "holdId");
    }
    if (!idempotencyKey) {
        throw new ValidationError("Idempotency key is required", undefined, "idempotencyKey");
    }

    return holdsRepository.withIdempotencyLock(idempotencyKey, async () => {
        const existingBooking = await holdsRepository.findConfirmationByIdempotencyKey(
            idempotencyKey
        );

        if (existingBooking) {
            if (existingBooking.holdId !== id) {
                throw new ConflictError(
                    "Idempotency key was already used for another hold",
                    "idempotencyKey"
                );
            }

            return { booking: existingBooking, replayed: true };
        }

        const authorizationContext = await holdsRepository.getAuthorizationContext(id);
        const bookingId = randomUUID();
        const authorization = await stripePaymentProvider.authorize({
            bookingId,
            userId: authorizationContext.userId,
            amountCents: authorizationContext.amountCents,
            idempotencyKey
        });

        try {
            return await holdsRepository.confirm({
                holdId: id,
                idempotencyKey,
                bookingId,
                authorizationId: authorization.authorizationId,
                amountCents: authorizationContext.amountCents
            });
        } catch (error) {
            try {
                await stripePaymentProvider.voidAuthorization(authorization.authorizationId);
            } catch (voidError) {
                throw new Error("Confirmation failed and payment authorization could not be voided", {
                    cause: new AggregateError([error, voidError])
                });
            }

            throw error;
        }
    });
};

export const expireStaleHolds = async (limit: number = 100): Promise<HoldId[]> => {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new ValidationError("Invalid expiry batch limit", { limit }, "limit");
    }

    return await holdsRepository.expireBatch(limit);
};