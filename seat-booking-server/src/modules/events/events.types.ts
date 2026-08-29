import type { z } from "zod";
import type {
    eventIdParamsSchema,
    eventResponseSchema,
    eventSeatResponseSchema,
    eventSeatsResponseSchema,
    listEventsQuerySchema,
    listEventsResponseSchema
} from "./events.schema.js";

export type EventId = string;

export interface Event {
    id: EventId;
    name: string;
    startsAt: Date;
    createdAt: Date;
}

export interface EventSeat {
    id: string;
    eventId: EventId;
    rowLabel: string;
    seatNumber: number;
    priceCents: number;
    version: number;
}


export type EventIdParams = z.infer<typeof eventIdParamsSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type EventResponse = z.infer<typeof eventResponseSchema>;
export type EventSeatResponse = z.infer<typeof eventSeatResponseSchema>;
export type ListEventsResponse = z.infer<typeof listEventsResponseSchema>;
export type EventSeatsResponse = z.infer<typeof eventSeatsResponseSchema>;

export interface EventsRepository {
    findById(id: EventId): Promise<Event | null>;
    findMany(query: ListEventsQuery): Promise<{
        events: Event[];
        nextCursor: EventId | null;
    }>;
    findSeats(eventId: EventId): Promise<EventSeat[]>;
}
