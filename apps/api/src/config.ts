const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET;

if (isProduction && !jwtSecret) {
  throw new Error("JWT_SECRET must be set when NODE_ENV=production");
}

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
  : undefined;

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "127.0.0.1",
  logLevel: process.env.LOG_LEVEL ?? "info",
  jwtSecret: jwtSecret ?? "dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 300),
  rateLimitTimeWindow: process.env.RATE_LIMIT_TIME_WINDOW ?? "1 minute",
  corsOrigins: corsOrigins ?? true,
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5433/expense_splitter"
} as const;
