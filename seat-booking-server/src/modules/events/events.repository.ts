import { pool } from "../../shared/db.js";
import { ValidationError } from "@seat-booking/errors";
import { Event, EventId, EventSeat, EventsRepository, ListEventsQuery } from "./events.types.js";

const toEvent = (row: Event): Event => ({
    id: row.id,
    name: row.name,
    startsAt: row.startsAt,
    createdAt: row.createdAt
});

const toEventSeat = (row: EventSeat): EventSeat => ({
    id: row.id,
    eventId: row.eventId,
    rowLabel: row.rowLabel,
    seatNumber: row.seatNumber,
    priceCents: row.priceCents,
    version: row.version
});

export const eventsRepository: EventsRepository = {
    async findById(id: EventId): Promise<Event | null> {
        if (!id) {
            throw new ValidationError("Invalid event id", { id }, "eventId");
        }

        const result = await pool.query<Event>(
            `
                SELECT
                    id,
                    name,
                    starts_at AS "startsAt",
                    created_at AS "createdAt"
                FROM events
                WHERE id = $1
            `,
            [id]
        );

        return result.rows[0] ? toEvent(result.rows[0]) : null;
    },

    async findMany(query: ListEventsQuery): Promise<{ events: Event[]; nextCursor: EventId | null }> {
        if (!query.limit || query.limit < 1 || query.limit > 100) {
            throw new ValidationError("Invalid limit", { limit: query.limit }, "limit");
        }

        const values: Array<string | number> = [];
        const whereClause = query.cursor
            ? `WHERE id > $${values.push(query.cursor)}`
            : "";
        values.push(query.limit + 1);

        const result = await pool.query<Event>(
            `
                SELECT
                    id,
                    name,
                    starts_at AS "startsAt",
                    created_at AS "createdAt"
                FROM events
                ${whereClause}
                ORDER BY id ASC
                LIMIT $${values.length}
            `,
            values
        );

        const events = result.rows.slice(0, query.limit).map(toEvent);
        const nextCursor = result.rows.length > query.limit
            ? events[events.length - 1].id
            : null;

        return {
            events,
            nextCursor
        };
    },

    async findSeats(eventId: EventId): Promise<EventSeat[]> {
        if (!eventId) {
            throw new ValidationError("Invalid event id", { eventId }, "eventId");
        }

        const result = await pool.query<EventSeat>(
            `
                SELECT
                    id,
                    event_id AS "eventId",
                    row_label AS "rowLabel",
                    seat_number AS "seatNumber",
                    price_cents AS "priceCents",
                    version
                FROM seats
                WHERE event_id = $1
                ORDER BY row_label ASC, seat_number ASC
            `,
            [eventId]
        );

        return result.rows.map(toEventSeat);
    }
};
