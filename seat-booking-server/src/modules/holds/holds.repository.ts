import { pool, withTransaction } from "../../shared/db.js";
import { ConflictError, GoneError, ValidationError } from "@seat-booking/errors";
import { HoldId, HoldResponse, HoldSeatResponse, HoldStatus, HoldsRepository } from "./holds.types.js";

type HoldRow = {
    id: string;
    eventId: string;
    userId: string;
    status: HoldStatus;
    expiresAt: Date;
    createdAt: Date;
};

export const holdsRepository: HoldsRepository = {
    async create(input: {
        eventId: string;
        userId: string;
        seatIds: string[];
        expiresAt: Date;
    }): Promise<HoldResponse> {
        if (!input.eventId) {
            throw new ValidationError("Invalid event id", { eventId: input.eventId }, "eventId");
        }
        if (!input.userId) {
            throw new ValidationError("Invalid user id", { userId: input.userId }, "userId");
        }
        if (!input.seatIds) {
            throw new ValidationError("Invalid seat ids", { seatIds: input.seatIds }, "seatIds");
        }
        if (!input.expiresAt) {
            throw new ValidationError("Invalid expires at", { expiresAt: input.expiresAt }, "expiresAt");
        }
        if (input.seatIds.length === 0) {
            throw new ValidationError("Invalid seat ids", { seatIds: input.seatIds }, "seatIds");
        }
        if (input.expiresAt < new Date()) {
            throw new ValidationError("Invalid expires at", { expiresAt: input.expiresAt }, "expiresAt");
        }

        if (input.seatIds.some((seatId) => !seatId)) {
            throw new ValidationError("Invalid seat ids", { seatIds: input.seatIds }, "seatIds");
        }

        return withTransaction(async (client) => {
            const selectedSeats = await client.query<{ id: string }>(
                `
                    SELECT id
                    FROM seats
                    WHERE event_id = $1
                      AND id = ANY($2::uuid[])
                    FOR UPDATE
                `,
                [input.eventId, input.seatIds]
            );

            if (selectedSeats.rows.length !== input.seatIds.length) {
                throw new ValidationError(
                    "One or more seats do not belong to this event",
                    { eventId: input.eventId, seatIds: input.seatIds },
                    "seatIds"
                );
            }

            const unavailableSeats = await client.query<{ seatId: string }>(
                `
                    SELECT seat_id AS "seatId"
                    FROM hold_seats
                    WHERE locked_seat_id = ANY($1::uuid[])
                `,
                [input.seatIds]
            );

            if (unavailableSeats.rows.length > 0) {
                throw new ConflictError(
                    "One or more selected seats are unavailable",
                    "seatIds"
                );
            }

            const holdResult = await client.query<HoldRow>(
                `
                    INSERT INTO holds (event_id, user_id, status, expires_at)
                    VALUES ($1, $2, 'active', $3)
                    RETURNING
                        id,
                        event_id AS "eventId",
                        user_id AS "userId",
                        status,
                        expires_at AS "expiresAt",
                        created_at AS "createdAt"
                `,
                [input.eventId, input.userId, input.expiresAt]
            );
            const hold = holdResult.rows[0];

            await client.query(
                `
                    INSERT INTO hold_seats (hold_id, seat_id, hold_status)
                    SELECT $1, seat_id, 'active'
                    FROM unnest($2::uuid[]) AS seat_id
                `,
                [hold.id, input.seatIds]
            );

            return {
                id: hold.id,
                eventId: hold.eventId,
                userId: hold.userId,
                status: hold.status,
                expiresAt: hold.expiresAt.toISOString(),
                createdAt: hold.createdAt.toISOString(),
                seatIds: input.seatIds
            };
        });
    },
    async findById(id: HoldId): Promise<HoldResponse | null> {
        const hold = await pool.query(
            `SELECT id, event_id, user_id, status, expires_at, created_at FROM holds WHERE id = $1`,
            [id]
        );

        return hold.rows[0];
    },
    async findSeats(holdId: HoldId): Promise<HoldSeatResponse[]> {
        const seats = await pool.query(
            `SELECT * FROM hold_seats WHERE hold_id = $1`,
            [holdId]
        );

        return seats.rows;
    },
    async updateStatus(id: HoldId, status: HoldStatus): Promise<HoldResponse | null> {
        return withTransaction(async (client) => {
            const hold = await client.query(
                `UPDATE holds SET status = $1 WHERE id = $2 RETURNING *`,
                [status, id]
            );

            if (hold.rows.length === 0) {
                return null;
            }

            await client.query(
                `UPDATE hold_seats SET hold_status = $1 WHERE hold_id = $2`,
                [status, id]
            );

            return hold.rows[0];
        });
    },
    async delete(id: HoldId): Promise<void> {
        await pool.query(
            `DELETE FROM holds WHERE id = $1`,
            [id]
        );
    },
    async withIdempotencyLock<T>(
        idempotencyKey: string,
        operation: () => Promise<T>
    ): Promise<T> {
        const client = await pool.connect();

        try {
            await client.query("SELECT pg_advisory_lock(hashtext($1))", [idempotencyKey]);
            return await operation();
        } finally {
            await client
                .query("SELECT pg_advisory_unlock(hashtext($1))", [idempotencyKey])
                .catch(() => undefined);
            client.release();
        }
    },
    async findConfirmationByIdempotencyKey(idempotencyKey) {
        const result = await pool.query<{
            holdId: HoldId;
            responseBody: import("./holds.types.js").BookingConfirmation;
        }>(
            `
                SELECT
                    hold_id AS "holdId",
                    response_body AS "responseBody"
                FROM bookings
                WHERE idempotency_key = $1
            `,
            [idempotencyKey]
        );

        return result.rows[0]?.responseBody ?? null;
    },
    async getAuthorizationContext(id) {
        const result = await pool.query<{
            status: HoldStatus;
            expiresAt: Date;
            userId: string;
            amountCents: number;
            seatCount: number;
        }>(
            `
                SELECT
                    holds.status,
                    holds.expires_at AS "expiresAt",
                    holds.user_id AS "userId",
                    COALESCE(SUM(seats.price_cents), 0)::int AS "amountCents",
                    COUNT(seats.id)::int AS "seatCount"
                FROM holds
                LEFT JOIN hold_seats
                    ON hold_seats.hold_id = holds.id
                   AND hold_seats.hold_status = 'active'
                LEFT JOIN seats ON seats.id = hold_seats.seat_id
                WHERE holds.id = $1
                GROUP BY holds.id
            `,
            [id]
        );
        const hold = result.rows[0];

        if (!hold || hold.status !== "active" || hold.expiresAt <= new Date()) {
            throw new GoneError("Hold is not active or has expired", "hold");
        }
        if (hold.seatCount === 0) {
            throw new ValidationError("Cannot confirm a hold without seats", { holdId: id }, "hold");
        }

        return { userId: hold.userId, amountCents: hold.amountCents };
    },
    async confirm(input) {
        return withTransaction(async (client) => {
            const existing = await client.query<{
                holdId: HoldId;
                responseBody: import("./holds.types.js").BookingConfirmation;
            }>(
                `
                    SELECT
                        hold_id AS "holdId",
                        response_body AS "responseBody"
                    FROM bookings
                    WHERE idempotency_key = $1
                `,
                [input.idempotencyKey]
            );

            if (existing.rows[0]) {
                if (existing.rows[0].holdId !== input.holdId) {
                    throw new ConflictError(
                        "Idempotency key was already used for another hold",
                        "idempotencyKey"
                    );
                }

                return { booking: existing.rows[0].responseBody, replayed: true };
            }

            const hold = await client.query<{
                id: HoldId;
                userId: string;
                status: HoldStatus;
                expiresAt: Date;
            }>(
                `
                    SELECT
                        id,
                        user_id AS "userId",
                        status,
                        expires_at AS "expiresAt"
                    FROM holds
                    WHERE id = $1
                    FOR UPDATE
                `,
                [input.holdId]
            );
            const lockedHold = hold.rows[0];

            if (
                !lockedHold ||
                lockedHold.status !== "active" ||
                lockedHold.expiresAt <= new Date()
            ) {
                throw new GoneError("Hold is not active or has expired", "hold");
            }

            const bookingAmount = await client.query<{
                amountCents: number;
                seatCount: number;
            }>(
                `
                    SELECT
                        COALESCE(SUM(seats.price_cents), 0)::int AS "amountCents",
                        COUNT(*)::int AS "seatCount"
                    FROM hold_seats
                    INNER JOIN seats ON seats.id = hold_seats.seat_id
                    WHERE hold_seats.hold_id = $1
                      AND hold_seats.hold_status = 'active'
                `,
                [input.holdId]
            );
            const amount = bookingAmount.rows[0];

            if (amount.seatCount === 0 || amount.amountCents !== input.amountCents) {
                throw new ValidationError(
                    "Hold seats changed before confirmation",
                    { holdId: input.holdId },
                    "hold"
                );
            }

            const notificationDetails = await client.query<{
                email: string;
                fullName: string;
                eventId: string;
                eventName: string;
                startsAt: Date;
                seats: Array<{ id: string; rowLabel: string; seatNumber: number }>;
            }>(
                `
                    SELECT
                        users.email,
                        users.full_name AS "fullName",
                        events.id AS "eventId",
                        events.name AS "eventName",
                        events.starts_at AS "startsAt",
                        jsonb_agg(
                            jsonb_build_object(
                                'id', seats.id,
                                'rowLabel', seats.row_label,
                                'seatNumber', seats.seat_number
                            )
                            ORDER BY seats.row_label, seats.seat_number
                        ) AS seats
                    FROM holds
                    INNER JOIN users ON users.id = holds.user_id
                    INNER JOIN events ON events.id = holds.event_id
                    INNER JOIN hold_seats
                        ON hold_seats.hold_id = holds.id
                       AND hold_seats.hold_status = 'active'
                    INNER JOIN seats ON seats.id = hold_seats.seat_id
                    WHERE holds.id = $1
                    GROUP BY users.email, users.full_name, events.id, events.name, events.starts_at
                `,
                [input.holdId]
            );
            const notification = notificationDetails.rows[0];

            if (!notification) {
                throw new ValidationError(
                    "Cannot create a booking notification without recipient details",
                    { holdId: input.holdId },
                    "hold"
                );
            }

            const booking = {
                id: input.bookingId,
                holdId: input.holdId,
                userId: lockedHold.userId,
                amountCents: input.amountCents,
                status: "pending" as const,
                authorizationId: input.authorizationId
            };

            await client.query(
                `
                    INSERT INTO bookings (
                        id,
                        hold_id,
                        user_id,
                        amount_cents,
                        status,
                        idempotency_key,
                        response_body
                    )
                    VALUES ($1, $2, $3, $4, 'pending', $5, $6::jsonb)
                `,
                [
                    booking.id,
                    booking.holdId,
                    booking.userId,
                    booking.amountCents,
                    input.idempotencyKey,
                    JSON.stringify(booking)
                ]
            );

            await client.query(
                `UPDATE holds SET status = 'confirmed' WHERE id = $1`,
                [input.holdId]
            );
            await client.query(
                `
                    UPDATE hold_seats
                    SET hold_status = 'confirmed'
                    WHERE hold_id = $1
                      AND hold_status = 'active'
                `,
                [input.holdId]
            );

            await client.query(
                `
                    INSERT INTO outbox (aggregate_id, event_type, payload)
                    VALUES ($1, 'booking.confirmed', $2::jsonb)
                `,
                [
                    booking.id,
                    JSON.stringify({
                        version: 1,
                        booking,
                        recipient: {
                            email: notification.email,
                            fullName: notification.fullName
                        },
                        event: {
                            id: notification.eventId,
                            name: notification.eventName,
                            startsAt: notification.startsAt.toISOString()
                        },
                        seats: notification.seats
                    })
                ]
            );

            return { booking, replayed: false };
        });
    },
    async expireBatch(limit: number): Promise<HoldId[]> {
        return withTransaction(async (client) => {
            const expiredHolds = await client.query<{ id: HoldId }>(
                `
                    SELECT id
                    FROM holds
                    WHERE status = 'active'
                      AND expires_at < now()
                    ORDER BY expires_at ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT $1
                `,
                [limit]
            );
            const holdIds = expiredHolds.rows.map((hold) => hold.id);

            if (holdIds.length === 0) {
                return [];
            }

            await client.query(
                `
                    UPDATE holds
                    SET status = 'expired'
                    WHERE id = ANY($1::uuid[])
                `,
                [holdIds]
            );
            await client.query(
                `
                    UPDATE hold_seats
                    SET hold_status = 'expired'
                    WHERE hold_id = ANY($1::uuid[])
                `,
                [holdIds]
            );

            return holdIds;
        });
    },
};