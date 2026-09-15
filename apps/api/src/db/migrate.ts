import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { config } from "../config.js";
import { createPool } from "./pool.js";

const defaultMigrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);

export async function migrate(
  pool: Pool,
  migrationsDir: string = defaultMigrationsDir
): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`
  );

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const { rows } = await pool.query<{ version: string }>(
    "SELECT version FROM schema_migrations"
  );
  const applied = new Set(rows.map((row) => row.version));

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [
        file
      ]);
      await client.query("COMMIT");
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const pool = createPool(config.databaseUrl);
  try {
    await migrate(pool);
    console.log("Migrations up to date");
  } finally {
    await pool.end();
  }
}
