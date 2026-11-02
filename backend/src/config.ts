import { z } from "zod";

export type NodeEnvironment = "development" | "test" | "production";
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface AuthConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
  clockToleranceSeconds: number;
}

export interface DatabaseConfig {
  url: string;
  poolMax: number;
  expectedRole: string;
}

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  host: string;
  port: number;
  logLevel: LogLevel;
  database: DatabaseConfig;
  auth: AuthConfig | null;
  trustProxy: boolean | string | string[];
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required."),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  DATABASE_EXPECTED_ROLE: z.string().trim().min(1).max(63).default("app_rw"),
  AUTH_ISSUER: z.string().trim().max(500).optional(),
  AUTH_AUDIENCE: z.string().trim().max(200).optional(),
  AUTH_JWKS_URL: z.string().trim().max(1000).optional(),
  AUTH_CLOCK_TOLERANCE_SECONDS: z.coerce.number().int().min(0).max(120).default(30),
  TRUST_PROXY: z.string().trim().optional(),
});

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const normalized = {
    ...environment,
    AUTH_ISSUER: environment.AUTH_ISSUER?.trim() || undefined,
    AUTH_AUDIENCE: environment.AUTH_AUDIENCE?.trim() || undefined,
    AUTH_JWKS_URL: environment.AUTH_JWKS_URL?.trim() || undefined,
  };

  const parsed = envSchema.safeParse(normalized);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new ConfigurationError(`Invalid server configuration. ${details}`);
  }

  const env = parsed.data;
  assertDatabaseUrl(env.DATABASE_URL);
  const auth = buildAuthConfig(env);

  return {
    nodeEnv: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    database: {
      url: env.DATABASE_URL,
      poolMax: env.DATABASE_POOL_MAX,
      expectedRole: env.DATABASE_EXPECTED_ROLE,
    },
    auth,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
  };
}

function buildAuthConfig(env: z.infer<typeof envSchema>): AuthConfig | null {
  const values = [env.AUTH_ISSUER, env.AUTH_AUDIENCE, env.AUTH_JWKS_URL];
  const configuredCount = values.filter((value) => value !== undefined).length;

  if (configuredCount === 0) {
    return null;
  }

  if (configuredCount !== 3) {
    throw new ConfigurationError(
      "AUTH_ISSUER, AUTH_AUDIENCE, and AUTH_JWKS_URL must be set together, or all left blank.",
    );
  }

  const issuer = env.AUTH_ISSUER as string;
  const audience = env.AUTH_AUDIENCE as string;
  const jwksUrl = env.AUTH_JWKS_URL as string;

  assertHttpUrl(issuer, "AUTH_ISSUER", env.NODE_ENV);
  assertHttpUrl(jwksUrl, "AUTH_JWKS_URL", env.NODE_ENV);

  return {
    issuer,
    audience,
    jwksUrl,
    clockToleranceSeconds: env.AUTH_CLOCK_TOLERANCE_SECONDS,
  };
}

function assertDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new ConfigurationError(
      "DATABASE_URL must use the postgres:// or postgresql:// scheme.",
    );
  }
}

function assertHttpUrl(value: string, name: string, nodeEnv: NodeEnvironment): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError(`${name} must be a valid URL.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ConfigurationError(`${name} must use http or https.`);
  }

  const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const allowLocalHttp = url.protocol === "http:" && localHost && nodeEnv !== "production";

  if (url.protocol !== "https:" && !allowLocalHttp) {
    throw new ConfigurationError(`${name} must use https outside local development.`);
  }
}

function parseTrustProxy(value: string | undefined): boolean | string | string[] {
  if (!value) {
    return false;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function describeDatabaseTarget(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    const databaseName = url.pathname.replace(/^\//, "") || "unknown";
    const port = url.port ? `:${url.port}` : "";
    return `${url.hostname}${port}/${databaseName}`;
  } catch {
    return "configured database";
  }
}
