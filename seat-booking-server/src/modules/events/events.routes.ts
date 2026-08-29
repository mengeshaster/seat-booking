import { Router } from "express";
import { ValidationError } from "@seat-booking/errors";
import { createHoldBodySchema } from "../holds/holds.schema.js";
import { createHold } from "../holds/holds.service.js";
import { eventIdParamsSchema, listEventsQuerySchema } from "./events.schema.js";
import { getEventById, getEventSeats, getEvents } from "./events.service.js";

const router = Router();

router.get("/", async (req, res) => {
    const parsed = listEventsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
        throw new ValidationError(
            "Invalid events query parameters",
            parsed.error.flatten(),
            "events"
        );
    }

    const { cursor, limit } = parsed.data;
    const events = await getEvents(cursor, limit);
    return res.json(events);
});

router.get("/:id/seats", async (req, res) => {
    const parsed = eventIdParamsSchema.safeParse(req.params);

    if (!parsed.success) {
        throw new ValidationError(
            "Invalid event id",
            parsed.error.flatten(),
            "eventId"
        );
    }

    const { id } = parsed.data;
    const seats = await getEventSeats(id);
    return res.json(seats);
});

router.get("/:id", async (req, res) => {
    const parsed = eventIdParamsSchema.safeParse(req.params);

    if (!parsed.success) {
        throw new ValidationError(
            "Invalid event id",
            parsed.error.flatten(),
            "eventId"
        );
    }

    const { id } = parsed.data;
    const event = await getEventById(id);
    return res.json(event);
});

router.post("/:id/holds", async (req, res) => {
    const parsed = eventIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
        throw new ValidationError(
            "Invalid event id",
            parsed.error.flatten(),
            "eventId"
        );
    }

    const parsedHold = createHoldBodySchema.safeParse(req.body);
    if (!parsedHold.success) {
        throw new ValidationError(
            "Invalid create hold body",
            parsedHold.error.flatten(),
            "createHoldBody"
        );
    }

    const { id } = parsed.data;
    const { seatIds, userId } = parsedHold.data;


    const holds = await createHold({
        eventId: id,
        userId,
        seatIds: seatIds as string[],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    })

    return res.status(201).json(holds);

});

export default router;