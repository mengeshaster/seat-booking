import { NotFoundError, ValidationError } from "@seat-booking/errors";
import { eventsRepository } from "./events.repository.js";
import {
    Event,
    EventResponse,
    EventSeatsResponse,
    ListEventsResponse
} from "./events.types.js";

const toEventResponse = (event: Event): EventResponse => ({
    id: event.id,
    name: event.name,
    startsAt: event.startsAt.toISOString(),
    createdAt: event.createdAt.toISOString()
});

export const getEvents = async (
    cursor: string | undefined,
    limit: number
): Promise<ListEventsResponse> => {

    const { events, nextCursor } = await eventsRepository.findMany({ cursor, limit });

    if (events.length === 0) {
        throw new NotFoundError("No events found", "events");
    }

    return {
        events: events.map(toEventResponse),
        nextCursor
    };
};

export const getEventById = async (id: string): Promise<EventResponse> => {

    if (!id) {
        throw new ValidationError("Invalid event id", { id }, "eventId");
    }

    const event = await eventsRepository.findById(id);

    if (!event) {
        throw new NotFoundError("Event not found", "event");
    }

    return toEventResponse(event);
};

export const getEventSeats = async (eventId: string): Promise<EventSeatsResponse> => {

    if (!eventId) {
        throw new ValidationError("Invalid event id", { eventId }, "eventId");
    }

    const seats = await eventsRepository.findSeats(eventId);

    if (seats.length === 0) {
        throw new NotFoundError("No seats found", "seats");
    }

    return {
        eventId: seats[0].eventId,
        seats: seats.map((seat) => ({
            id: seat.id,
            eventId: seat.eventId,
            rowLabel: seat.rowLabel,
            seatNumber: seat.seatNumber,
            priceCents: seat.priceCents,
            version: seat.version
        })),
    };
};