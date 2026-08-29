import { ValidationError } from "@seat-booking/errors";
import { Router } from "express";
import { receivePaymentWebhook } from "./payment.service.js";
import { paymentWebhookSchema } from "./payment.webhook.schema.js";

const router = Router();

router.post("/payment-status", async (req, res) => {
    const parsedEvent = paymentWebhookSchema.safeParse(req.body);

    if (!parsedEvent.success) {
        throw new ValidationError(
            "Invalid payment webhook event",
            parsedEvent.error.flatten(),
            "paymentWebhook"
        );
    }

    const { event, outcome } = await receivePaymentWebhook(parsedEvent.data);

    return res.status(200).json({
        received: true,
        duplicate: outcome === "duplicate",
        outOfOrder: outcome === "outOfOrder",
        applied: outcome === "applied",
        event
    });
});

export default router;