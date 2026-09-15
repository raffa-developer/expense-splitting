import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { AppError } from "../errors.js";

interface PendingRecord {
  key: string;
  scope: string;
  requestHash: string;
}

interface KeyRow {
  scope: string;
  request_hash: string;
  status_code: number;
  response_body: unknown;
}

const pendingRequests = new WeakMap<FastifyRequest, PendingRecord>();

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const parts = Object.keys(record)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`
    );
  return `{${parts.join(",")}}`;
}

function hashRequest(request: FastifyRequest): string {
  const payload = stableStringify({
    params: request.params,
    body: request.body ?? null
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function registerIdempotency(app: FastifyInstance, pool: Pool): void {
  app.addHook("preHandler", async (request, reply) => {
    if (!request.routeOptions.config.idempotency) {
      return;
    }

    const rawKey = request.headers["idempotency-key"];
    if (rawKey === undefined) {
      return;
    }
    if (typeof rawKey !== "string") {
      throw new AppError(
        400,
        "INVALID_IDEMPOTENCY_KEY",
        "Idempotency-Key must be a single header value"
      );
    }

    const key = rawKey.trim();
    if (key.length === 0 || key.length > 255) {
      throw new AppError(
        400,
        "INVALID_IDEMPOTENCY_KEY",
        "Idempotency-Key must be a non-empty string of at most 255 characters"
      );
    }

    const scope = `${request.method} ${request.routeOptions.url}`;
    const requestHash = hashRequest(request);

    const { rows } = await pool.query<KeyRow>(
      `SELECT scope, request_hash, status_code, response_body
       FROM idempotency_keys
       WHERE key = $1`,
      [key]
    );

    const existing = rows[0];
    if (existing) {
      if (existing.scope !== scope || existing.request_hash !== requestHash) {
        throw new AppError(
          422,
          "IDEMPOTENCY_KEY_REUSED",
          "This Idempotency-Key was already used for a different request"
        );
      }
      if (existing.response_body === null) {
        throw new AppError(
          409,
          "REQUEST_IN_PROGRESS",
          "A request with this Idempotency-Key is still being processed"
        );
      }
      return reply
        .status(existing.status_code)
        .header("idempotency-replayed", "true")
        .send(existing.response_body);
    }

    const inserted = await pool.query(
      `INSERT INTO idempotency_keys (key, scope, request_hash, status_code)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (key) DO NOTHING`,
      [key, scope, requestHash]
    );

    if (inserted.rowCount === 0) {
      throw new AppError(
        409,
        "REQUEST_IN_PROGRESS",
        "A request with this Idempotency-Key is still being processed"
      );
    }

    pendingRequests.set(request, { key, scope, requestHash });
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const record = pendingRequests.get(request);
    if (!record) {
      return payload;
    }

    const contentType = reply.getHeader("content-type");
    const isJson =
      typeof contentType === "string" &&
      contentType.includes("application/json");

    if (
      reply.statusCode >= 200 &&
      reply.statusCode < 300 &&
      isJson &&
      typeof payload === "string"
    ) {
      await pool.query(
        `UPDATE idempotency_keys
         SET status_code = $2, response_body = $3::jsonb
         WHERE key = $1`,
        [record.key, reply.statusCode, payload]
      );
    } else {
      await pool.query(`DELETE FROM idempotency_keys WHERE key = $1`, [
        record.key
      ]);
    }

    pendingRequests.delete(request);
    return payload;
  });
}
