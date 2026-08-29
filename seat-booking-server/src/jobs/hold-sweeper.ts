import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@seat-booking/observability";
import { expireStaleHolds } from "../modules/holds/holds.service.js";
import { connectDatabase, disconnectDatabase } from "../shared/db.js";

const SWEEP_INTERVAL_MS = 10_000;
const SWEEP_BATCH_SIZE = 100;

export async function sweepExpiredHolds(
    batchSize: number = SWEEP_BATCH_SIZE
): Promise<number> {
    const expiredHoldIds = await expireStaleHolds(batchSize);

    if (expiredHoldIds.length > 0) {
        logger.info("holds.expired", {
            count: expiredHoldIds.length,
            holdIds: expiredHoldIds
        });
    }

    return expiredHoldIds.length;
}

export function startHoldSweeper(
    intervalMs: number = SWEEP_INTERVAL_MS
): () => void {
    let isRunning = false;

    const tick = async () => {
        if (isRunning) {
            return;
        }

        isRunning = true;

        try {
            await sweepExpiredHolds();
        } catch (error) {
            logger.error("hold_sweeper.failed", { error });
        } finally {
            isRunning = false;
        }
    };

    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    logger.info("hold_sweeper.started", {
        intervalMs,
        batchSize: SWEEP_BATCH_SIZE
    });

    return () => clearInterval(timer);
}

async function runStandalone(): Promise<void> {
    await connectDatabase();

    const stop = startHoldSweeper();

    const shutdown = async (signal: NodeJS.Signals) => {
        stop();
        logger.info("hold_sweeper.stopping", { signal });
        await disconnectDatabase();
        process.exit(0);
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

const isStandalone =
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isStandalone) {
    runStandalone().catch((error) => {
        logger.error("hold_sweeper.start_failed", { error });
        process.exit(1);
    });
}
