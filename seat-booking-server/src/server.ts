import http from "http";
import { logger } from "@seat-booking/observability";
import { app } from "./app.js";
import { startHoldSweeper } from "./jobs/hold-sweeper.js";
import { startOutboxPublisher } from "./jobs/outbox-publisher.js";
import { config } from "./shared/config.js";
import { connectDatabase, disconnectDatabase } from "./shared/db.js";

async function startServer() {
    try {
        await connectDatabase();
        logger.info("database.connected");

        const server = http.createServer(app);
        const stopHoldSweeper = startHoldSweeper();
        const stopOutboxPublisher = startOutboxPublisher();
        let isShuttingDown = false;

        const shutdown = (signal: NodeJS.Signals) => {
            if (isShuttingDown) {
                return;
            }

            isShuttingDown = true;
            logger.info("server.shutting_down", { signal });

            server.close(async (serverError) => {
                try {
                    stopHoldSweeper();
                    await stopOutboxPublisher();
                    await disconnectDatabase();
                    logger.info("database.disconnected");
                    process.exit(serverError ? 1 : 0);
                } catch (databaseError) {
                    logger.error("database.disconnect_failed", { error: databaseError });
                    process.exit(1);
                }
            });
        };

        process.once("SIGINT", () => shutdown("SIGINT"));
        process.once("SIGTERM", () => shutdown("SIGTERM"));

        server.listen(config.port, () => {
            logger.info("server.started", { port: config.port });
        });
    } catch (error) {
        logger.error("server.start_failed", { error });
        process.exit(1);
    }
}

startServer();