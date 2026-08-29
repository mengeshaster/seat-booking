import { NextFunction, Request, Response } from "express";

/**
 * Fake authentication middleware that injects a user ID for all requests.
 * In production, replace with a real authentication solution.
 */
export function fakeAuth(req: Request, res: Response, next: NextFunction) {
    // For demonstration, always use a fixed fake user UUID
    (req as any).user = {
        id: "11111111-1111-1111-1111-111111111111"
    };
    next();
}