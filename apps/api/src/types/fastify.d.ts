import "fastify";
import "@fastify/jwt";

declare module "fastify" {
  interface FastifyContextConfig {
    idempotency?: boolean;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}
