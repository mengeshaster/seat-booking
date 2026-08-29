import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase, disconnectDatabase, pool } from "../src/shared/db.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(scriptDirectory, "../migrations");

async function applyMigrations(): Promise<void> {
    await connectDatabase();

    const client = await pool.connect();

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `);

        const appliedResult = await client.query<{ name: string }>(
            "SELECT name FROM schema_migrations"
        );
        const appliedMigrations = new Set(appliedResult.rows.map((row) => row.name));
        const migrationNames = (await readdir(migrationsDirectory))
            .filter((name) => name.endsWith(".sql"))
            .sort();

        for (const migrationName of migrationNames) {
            if (appliedMigrations.has(migrationName)) {
                continue;
            }

            const sql = await readFile(path.join(migrationsDirectory, migrationName), "utf8");

            await client.query("BEGIN");

            try {
                await client.query(sql);
                await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
                    migrationName
                ]);
                await client.query("COMMIT");
                console.log(`Applied migration ${migrationName}`);
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
        }
    } finally {
        client.release();
        await disconnectDatabase();
    }
}

applyMigrations().catch((error) => {
    console.error("Migration failed", error);
    process.exitCode = 1;
});
