import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions
} from "fastify";
import type { Pool } from "pg";
import { config } from "./config.js";
import { AppError } from "./errors.js";
import { registerAuth } from "./plugins/auth.js";
import { registerIdempotency } from "./plugins/idempotency.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBalanceRoutes } from "./routes/balances.js";
import { registerExpenseRoutes } from "./routes/expenses.js";
import { registerGroupRoutes } from "./routes/groups.js";
import { registerSettlementRoutes } from "./routes/settlements.js";
import { registerUserRoutes } from "./routes/users.js";

export interface BuildAppOptions {
  logger?: FastifyServerOptions["logger"];
  rateLimit?:
    | boolean
    | { max: number; timeWindow: number | string };
}

export async function buildApp(
  pool: Pool,
  options: BuildAppOptions = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    ajv: { customOptions: { removeAdditional: false } },
    requestIdHeader: "x-request-id"
  });

  await app.register(cors, { origin: config.corsOrigins });
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn }
  });

  if (options.rateLimit !== false) {
    const rateLimitOptions =
      typeof options.rateLimit === "object"
        ? options.rateLimit
        : {
            max: config.rateLimitMax,
            timeWindow: config.rateLimitTimeWindow
          };
    await app.register(rateLimit, rateLimitOptions);
  }
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Expense Splitting Engine API",
        description:
          "Calculates participant balances and generates optimized debt settlements with transactional consistency.",
        version: "0.7.0"
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const requestId = request.id;

    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error(error);
      } else {
        request.log.debug(
          { code: error.code, statusCode: error.statusCode },
          error.message
        );
      }
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, request_id: requestId }
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: error.message,
          request_id: requestId
        }
      });
    }

    if (
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code ?? "BAD_REQUEST",
          message: error.message,
          request_id: requestId
        }
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        request_id: requestId
      }
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
        request_id: request.id
      }
    });
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  app.get("/health", async () => ({ status: "ok" }));

  registerIdempotency(app, pool);
  registerAuth(app, pool);

  registerAuthRoutes(app, pool);
  registerUserRoutes(app, pool);
  registerGroupRoutes(app, pool);
  registerExpenseRoutes(app, pool);
  registerBalanceRoutes(app, pool);
  registerSettlementRoutes(app, pool);

  return app;
}
