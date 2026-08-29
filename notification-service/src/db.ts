import { Pool } from "pg";
import { config } from "./config.js";

export const pool = new Pool({ connectionString: config.databaseUrl });

export async function connectDatabase(): Promise<void> {
    await pool.query("SELECT 1");
}

export async function disconnectDatabase(): Promise<void> {
    await pool.end();
}
