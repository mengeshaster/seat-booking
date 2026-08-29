import { NotFoundError } from "@seat-booking/errors";
import { requestId } from "@seat-booking/http";
import cors from "cors";
import express from "express";
import bookingsRoutes from "./modules/bookings/bookings.routes.js";
import eventsRoutes from "./modules/events/events.routes.js";
import holdsRoutes from "./modules/holds/holds.routes.js";
import paymentWebhookRoutes from "./modules/payments/payment.webhook.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import errorHandler from "./shared/error-handler.js";
import { setupSwagger } from "./shared/swagger/swagger.js";

export const app = express();

app.use(requestId);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const API_PREFIX = "/api";
const API_VERSION = "v1";

// Helper to build API base path for versioned routes
function apiPath(path: string, version: string = API_VERSION) {
    return `${API_PREFIX}/${version}${path}`;
}

setupSwagger(app);

// Register routes
app.use(apiPath("/events"), eventsRoutes);
app.use(apiPath("/holds"), holdsRoutes);
app.use(apiPath("/bookings"), bookingsRoutes);
app.use(apiPath("/payments"), paymentWebhookRoutes);
app.use(apiPath("/users"), usersRoutes);
app.use(apiPath("/webhooks"), paymentWebhookRoutes);

app.use((_req, _res, next) => {
    next(new NotFoundError("Route not found"));
});

app.use(errorHandler);