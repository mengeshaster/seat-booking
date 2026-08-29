import { Router } from "express";
import { ValidationError } from "@seat-booking/errors";
import { bookingIdParamsSchema, bookingStatusSchema, idempotencyKeyQuerySchema } from "./bookings.schema.js";
import { deleteBooking, getBookingById, getBookingByIdempotencyKey, updateBookingStatus } from "./bookings.service.js";

const router = Router();

router.get("/:id/seats", async (req, res) => {
    const parsed = bookingIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
        throw new ValidationError(
            "Invalid booking id",
            parsed.error.flatten(),
            "bookingId"
        );
    }

    const { id } = parsed.data;
    const bookingResponse = await getBookingById(id);
    return res.json(bookingResponse);
});

router.get("/:idempotencyKey", async (req, res) => {
    const parsed = idempotencyKeyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        throw new ValidationError(
            "Invalid idempotency key",
            parsed.error.flatten(),
            "idempotencyKey"
        );
    }

    const { idempotencyKey } = parsed.data;
    const bookingResponse = await getBookingByIdempotencyKey(idempotencyKey);
    return res.json(bookingResponse);
});

router.put("/:id/status", async (req, res) => {
    const parsed = bookingIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
        throw new ValidationError(
            "Invalid booking id",
            parsed.error.flatten(),
            "bookingId"
        );
    }
    const { id } = parsed.data;
    const parsedStatus = bookingStatusSchema.safeParse(req.body);
    if (!parsedStatus.success) {
        throw new ValidationError(
            "Invalid booking status",
            parsedStatus.error.flatten(),
            "status"
        );
    }

    const status = parsedStatus.data;
    const bookingResponse = await updateBookingStatus(id, status);
    return res.json(bookingResponse);
});

router.delete("/:id", async (req, res) => {
    const parsed = bookingIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
        throw new ValidationError(
            "Invalid booking id",
            parsed.error.flatten(),
            "bookingId"
        );
    }

    const { id } = parsed.data;
    await deleteBooking(id);
    return res.status(204).send();
});

export default router;