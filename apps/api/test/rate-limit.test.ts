import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";
import { TEST_DATABASE_URL } from "./helpers.js";

let pool: Pool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = createPool(TEST_DATABASE_URL);
  await migrate(pool);
  app = await buildApp(pool, {
    rateLimit: { max: 2, timeWindow: "1 minute" }
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("rate limiting", () => {
  it("returns 429 after exceeding the limit", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await app.inject({ method: "GET", url: "/health" });
      statuses.push(response.statusCode);
    }

    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(200);
    expect(statuses[2]).toBe(429);
  });

  it("limits the login endpoint", async () => {
    let rateLimited = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "nobody@example.com", password: "wrong-password" }
      });
      if (response.statusCode === 429) {
        expect(response.json().error.request_id).toBeTypeOf("string");
        rateLimited = true;
        break;
      }
    }

    expect(rateLimited).toBe(true);
  });
});
