import { Router } from "express";
import { ValidationError } from "@seat-booking/errors";
import { readIdempotencyKey } from "@seat-booking/http";
import { holdIdParamsSchema, idempotencyKeyHeaderSchema } from "./holds.schema.js";
import { confirmHold, deleteHold } from "./holds.service.js";

const router = Router();

router.delete("/:id", async (req, res) => {
    const parsed = holdIdParamsSchema.safeParse(req.params);

    if (!parsed.success) {
        throw new ValidationError(
            "Invalid hold id",
            parsed.error.flatten(),
            "holdId"
        );
    }

    const { id } = parsed.data;
    await deleteHold(id);
    return res.status(204).send();
});

router.post("/:id/confirm", readIdempotencyKey, async (req, res) => {
    const parsed = holdIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
        throw new ValidationError(
            "Invalid hold id",
            parsed.error.flatten(),
            "holdId"
        );
    }

    const { id } = parsed.data;

    const parsedIdempotencyKey = idempotencyKeyHeaderSchema.safeParse({
        "Idempotency-Key": req.idempotencyKey
    });

    if (!parsedIdempotencyKey.success) {
        throw new ValidationError(
            "Invalid idempotency key",
            parsedIdempotencyKey.error.flatten(),
            "idempotencyKey"
        );
    }
    const idempotencyKey = parsedIdempotencyKey.data["Idempotency-Key"];
    const result = await confirmHold(id, idempotencyKey);
    return res.status(result.replayed ? 200 : 201).json(result.booking);
});

export default router;