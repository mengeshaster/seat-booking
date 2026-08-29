import { ValidationError } from "@seat-booking/errors";
import { bookingsRepository } from "./bookings.repository.js";
import { BookingId, BookingResponse, BookingStatus, CreateBookingBody } from "./bookings.types.js";

export const createBooking = async (input: CreateBookingBody): Promise<BookingResponse> => {
    if (!input.holdId) {
        throw new ValidationError("Hold id is required", undefined, "holdId");
    }
    if (!input.userId) {
        throw new ValidationError("User id is required", undefined, "userId");
    }
    if (!input.amountCents) {
        throw new ValidationError("Amount cents is required", undefined, "amountCents");
    }

    const booking = await bookingsRepository.create(input);
    return booking;
};

export const getBookingById = async (id: BookingId): Promise<BookingResponse> => {
    if (!id) {
        throw new ValidationError("Booking id is required", undefined, "bookingId");
    }

    const booking = await bookingsRepository.findById(id);
    if (!booking) {
        throw new Error("Booking not found");
    }
    return booking;
};

export const getBookingByIdempotencyKey = async (key: string): Promise<BookingResponse> => {
    if (!key) {
        throw new ValidationError("Idempotency key is required", undefined, "idempotencyKey");
    }

    const booking = await bookingsRepository.findByIdempotencyKey(key);
    if (!booking) {
        throw new Error("Booking not found");
    }
    return booking;
};

export const updateBookingStatus = async (id: BookingId, status: BookingStatus): Promise<BookingResponse> => {
    if (!id) {
        throw new ValidationError("Booking id is required", undefined, "bookingId");
    }
    if (!status) {
        throw new ValidationError("Status is required", undefined, "status");
    }

    const booking = await bookingsRepository.updateStatus(id, status);
    if (!booking) {
        throw new Error("Booking not found");
    }
    return booking;
};

export const deleteBooking = async (id: BookingId): Promise<void> => {
    if (!id) {
        throw new ValidationError("Booking id is required", undefined, "bookingId");
    }

    await bookingsRepository.delete(id);
};
