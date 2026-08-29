import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger, runWithRequestLogContext } from "@seat-booking/observability";

declare global {
    namespace Express {
        interface Request {
            idempotencyKey?: string;
        }
    }
}

const validRequestId = /^[A-Za-z0-9_-]{1,128}$/;

export function requestId(req: Request, res: Response, next: NextFunction): void {
    const incomingRequestId = req.header("x-request-id");
    const requestId =
        incomingRequestId && validRequestId.test(incomingRequestId)
            ? incomingRequestId
            : randomUUID();
    const startedAt = performance.now();

    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    runWithRequestLogContext(requestId, () => {
        logger.info("request.started", {
            method: req.method,
            path: req.originalUrl
        });

        res.on("finish", () => {
            logger.info("request.completed", {
                requestId,
                method: req.method,
                path: req.originalUrl,
                statusCode: res.statusCode,
                durationMs: Math.round(performance.now() - startedAt)
            });
        });

        next();
    });
}

export function readIdempotencyKey(req: Request, res: Response, next: NextFunction): void {
    const key = req.header("Idempotency-Key");

    if (!key) {
        res.status(400).json({ error: "Idempotency-Key header is required" });
        return;
    }

    req.idempotencyKey = key;
    next();
}
