import { Pool, type PoolClient } from "pg";
import { config } from "./config.js";

const globalForPool = globalThis as typeof globalThis & {
    pgPool?: Pool;
};

export const pool =
    globalForPool.pgPool ??
    new Pool({
        connectionString: config.databaseUrl
    });

if (config.nodeEnv !== "production") {
    globalForPool.pgPool = pool;
}

export async function connectDatabase(): Promise<void> {
    await pool.query("SELECT 1");
}

export async function disconnectDatabase(): Promise<void> {
    await pool.end();
}

export async function withTransaction<T>(
    operation: (client: PoolClient) => Promise<T>
): Promise<T> {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
