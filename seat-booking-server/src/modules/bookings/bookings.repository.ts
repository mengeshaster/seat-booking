import { pool } from "../../shared/db.js";
import { ValidationError } from "@seat-booking/errors";
import { BookingId, BookingResponse, BookingStatus, BookingsRepository, CreateBookingBody } from "./bookings.types.js";

export const bookingsRepository: BookingsRepository = {
    async create(input: CreateBookingBody): Promise<BookingResponse> {
        if (!input.holdId) {
            throw new ValidationError("Hold id is required", undefined, "holdId");
        }
        if (!input.userId) {
            throw new ValidationError("User id is required", undefined, "userId");
        }
        if (!input.amountCents) {
            throw new ValidationError("Amount cents is required", undefined, "amountCents");
        }
        if (!input.status) {
            throw new ValidationError("Status is required", undefined, "status");
        }
        if (!input.idempotencyKey) {
            throw new ValidationError("Idempotency key is required", undefined, "idempotencyKey");
        }
        if (!input.responseBody) {
            throw new ValidationError("Response body is required", undefined, "responseBody");
        }

        const booking = await pool.query(
            `INSERT INTO bookings (hold_id, user_id, amount_cents, status, idempotency_key, response_body) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [input.holdId, input.userId, input.amountCents, input.status, input.idempotencyKey, input.responseBody]
        );
        return booking.rows[0];
    },
    async findById(id: BookingId): Promise<BookingResponse | null> {
        if (!id) {
            throw new ValidationError("Booking id is required", undefined, "bookingId");
        }

        const booking = await pool.query<BookingResponse>(
            `
                SELECT
                    id,
                    hold_id AS "holdId",
                    user_id AS "userId",
                    amount_cents AS "amountCents",
                    status,
                    idempotency_key AS "idempotencyKey",
                    response_body AS "responseBody",
                    created_at AS "createdAt"
                FROM bookings
                WHERE id = $1
            `,
            [id]
        );
        return booking.rows[0];
    },
    async findByIdempotencyKey(key: string): Promise<BookingResponse | null> {
        if (!key) {
            throw new ValidationError("Idempotency key is required", undefined, "idempotencyKey");
        }

        const booking = await pool.query(
            `SELECT * FROM bookings WHERE idempotency_key = $1`,
            [key]
        );
        return booking.rows[0];
    },
    async updateStatus(id: BookingId, status: BookingStatus): Promise<BookingResponse | null> {
        if (!id) {
            throw new ValidationError("Booking id is required", undefined, "bookingId");
        }
        if (!status) {
            throw new ValidationError("Status is required", undefined, "status");
        }

        const booking = await pool.query(
            `UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *`,
            [status, id]
        );
        return booking.rows[0];
    },
    async delete(id: BookingId): Promise<void> {
        if (!id) {
            throw new ValidationError("Booking id is required", undefined, "bookingId");
        }

        await pool.query(
            `DELETE FROM bookings WHERE id = $1`,
            [id]
        );
    }
};