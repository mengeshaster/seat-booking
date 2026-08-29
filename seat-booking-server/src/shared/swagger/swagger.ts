import type { Express } from "express";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { config } from "../config.js";

export const swaggerDefinition: swaggerJSDoc.OAS3Definition = {
    openapi: "3.0.0",
    info: {
        title: "Seat Booking API",
        version: "1.0.0",
        description: "API documentation for the seat-booking service."
    },
    servers: [
        {
            url: `http://localhost:${config.port}/api/v1`,
            description: "Local development server"
        }
    ],
    tags: [
        { name: "Events" },
        { name: "Holds" },
        { name: "Bookings" }
    ],
    components: {
        parameters: {
            EventId: {
                in: "path",
                name: "id",
                required: true,
                schema: { type: "string", format: "uuid" }
            },
            HoldId: {
                in: "path",
                name: "id",
                required: true,
                schema: { type: "string", format: "uuid" }
            },
            BookingId: {
                in: "path",
                name: "id",
                required: true,
                schema: { type: "string", format: "uuid" }
            }
        },
        schemas: {
            Event: {
                type: "object",
                required: ["id", "name", "startsAt", "createdAt"],
                properties: {
                    id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    startsAt: { type: "string", format: "date-time" },
                    createdAt: { type: "string", format: "date-time" }
                }
            },
            Seat: {
                type: "object",
                required: ["id", "eventId", "rowLabel", "seatNumber", "priceCents", "version"],
                properties: {
                    id: { type: "string", format: "uuid" },
                    eventId: { type: "string", format: "uuid" },
                    rowLabel: { type: "string" },
                    seatNumber: { type: "integer" },
                    priceCents: { type: "integer", minimum: 0 },
                    version: { type: "integer", minimum: 0 }
                }
            },
            Hold: {
                type: "object",
                required: ["id", "eventId", "userId", "status", "expiresAt", "createdAt", "seatIds"],
                properties: {
                    id: { type: "string", format: "uuid" },
                    eventId: { type: "string", format: "uuid" },
                    userId: { type: "string", format: "uuid" },
                    status: {
                        type: "string",
                        enum: ["active", "released", "expired", "confirmed"]
                    },
                    expiresAt: { type: "string", format: "date-time" },
                    createdAt: { type: "string", format: "date-time" },
                    seatIds: {
                        type: "array",
                        items: { type: "string", format: "uuid" }
                    }
                }
            },
            Booking: {
                type: "object",
                required: ["id", "holdId", "userId", "amountCents", "status", "idempotencyKey"],
                properties: {
                    id: { type: "string", format: "uuid" },
                    holdId: { type: "string", format: "uuid" },
                    userId: { type: "string", format: "uuid" },
                    amountCents: { type: "integer", minimum: 0 },
                    status: { type: "string", enum: ["pending", "paid", "failed"] },
                    idempotencyKey: { type: "string" },
                    responseBody: {},
                    createdAt: { type: "string", format: "date-time" }
                }
            }
        }
    }
};

const options: swaggerJSDoc.OAS3Options = {
    definition: swaggerDefinition,
    apis: ["src/modules/**/open-api/*.ts"]
};

const swaggerSpec = swaggerJSDoc(options);

export function setupSwagger(app: Express, route = "/api-docs") {
    app.use(route, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
