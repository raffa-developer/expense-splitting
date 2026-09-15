import { buildApp } from "./app.js";
import { config } from "./config.js";
import { createPool } from "./db/pool.js";

const pool = createPool(config.databaseUrl);
const app = await buildApp(pool, { logger: { level: config.logLevel } });

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  await pool.end();
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
