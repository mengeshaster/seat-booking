import { Router } from "express";
import { ValidationError } from "@seat-booking/errors";
import { createUserBodySchema, userIdParamsSchema } from "./users.schema.js";
import { createUser, getUserById } from "./users.service.js";

const router = Router();

router.post("/", async (req, res) => {
    const parsed = createUserBodySchema.safeParse(req.body);

    if (!parsed.success) {
        throw new ValidationError("Invalid create user body", parsed.error.flatten(), "createUserBody");
    }

    const user = await createUser(parsed.data);
    return res.status(201).json(user);
});

router.get("/:id", async (req, res) => {
    const parsed = userIdParamsSchema.safeParse(req.params);

    if (!parsed.success) {
        throw new ValidationError("Invalid user id", parsed.error.flatten(), "userId");
    }

    const user = await getUserById(parsed.data.id);
    return res.json(user);
});

export default router;
