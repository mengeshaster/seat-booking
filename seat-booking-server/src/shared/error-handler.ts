import type { NextFunction, Request, Response } from "express";
import {
    ConflictError,
    GoneError,
    NotFoundError,
    ValidationError
} from "@seat-booking/errors";
import { logger } from "@seat-booking/observability";
import { config } from "./config.js";

/*
* Error handler middleware for seat-booking-server.
* Maps domain errors to appropriate HTTP responses.
* Intended mappings:
* - ValidationError    => 400 (bad request, validation failure)
* - NotFoundError      => 404 (not found)
* - ConflictError      => 409 (e.g. seat already held)
* - GoneError          => 410 (e.g. hold expired)
* - All others         => 500 (internal server error)
*/
const errorHandler = (
    error: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    let status = 500;

    if (error instanceof ValidationError) status = 400;
    else if (error instanceof NotFoundError) status = 404;
    else if (error instanceof ConflictError) status = 409;
    else if (error instanceof GoneError) status = 410;

    logger.error("request.failed", {
        requestId: res.locals.requestId,
        method: _req.method,
        path: _req.originalUrl,
        statusCode: status,
        error
    });

    return res.status(status).json({
        error: {
            code: error.name,
            message: status === 500 ? "Internal Server Error" : error.message,
            ...(error instanceof ValidationError && { details: error.errors }),
            ...(config.nodeEnv === "development" && { stack: error.stack })
        }
    });
};

export default errorHandler;