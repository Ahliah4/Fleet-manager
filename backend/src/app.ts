import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import type { AppConfig } from "./config.js";
import { createTokenVerifier, type TokenVerifier } from "./auth/jwtVerifier.js";
import { registerAuth } from "./auth/plugins.js";
import type { Database } from "./db/database.js";
import {
  AppError,
  duplicateVehicle,
  invalidReference,
  permissionDenied,
  type ErrorPayload,
} from "./domain/errors.js";
import { registerDriverRoutes } from "./routes/drivers.js";
import { registerFinanceRoutes } from "./routes/finance.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerHireRoutes } from "./routes/hires.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerPlatformRoutes } from "./routes/platform.js";
import { registerVehicleRoutes } from "./routes/vehicles.js";

export interface AppDependencies {
  config: AppConfig;
  database: Database;
  /**
   * Test-only token verifier injection. It is ignored unless NODE_ENV=test and
   * no real auth configuration is present. There is no environment-variable
   * bypass for authentication.
   */
  verifier?: TokenVerifier | null;
}

export async function buildApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const { config, database } = dependencies;
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
          "*.password",
          "*.token",
          "*.databaseUrl",
        ],
        censor: "[redacted]",
      },
      serializers: {
        req: (request) => ({
          method: request.method,
          url: request.url.split("?")[0],
          remoteAddress: request.ip,
        }),
        res: (reply) => ({ statusCode: reply.statusCode }),
        err: (error) => ({
          type: error.name,
          message: error.message,
          code: (error as { code?: string }).code ?? "",
          stack: error.stack ?? "",
        }),
      },
    },
    trustProxy: config.trustProxy,
    bodyLimit: 256 * 1024,
    requestTimeout: 15_000,
    connectionTimeout: 10_000,
    requestIdHeader: false,
    genReqId: (request) => {
      const header = request.headers["x-request-id"];
      if (typeof header === "string" && /^[A-Za-z0-9._-]{8,80}$/.test(header)) {
        return header;
      }
      return randomUUID();
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("cache-control", "no-store");
    return payload;
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  });

  const verifier = resolveVerifier(config, dependencies.verifier);
  registerAuth(app, { verifier, database });

  app.setErrorHandler((error, request, reply) => {
    const appError = mapError(error);
    const requestId = String(request.id);
    const logContext = {
      requestId,
      code: appError.code,
      statusCode: appError.statusCode,
      method: request.method,
      route: request.routeOptions.url,
      userId: request.session?.user.id,
      fleetId: request.session?.membership?.fleet.id,
    };

    if (appError.statusCode >= 500) {
      request.log.error({ ...logContext, err: error }, "Request failed");
    } else {
      request.log.warn(logContext, "Request rejected");
    }

    if (appError.statusCode === 401) {
      reply.header("www-authenticate", "Bearer");
    }

    const payload: ErrorPayload = {
      error: {
        code: appError.code,
        message: appError.message,
        supportReference: requestId,
        retryable: appError.retryable,
      },
    };
    if (appError.fieldErrors && Object.keys(appError.fieldErrors).length > 0) {
      payload.error.fieldErrors = appError.fieldErrors;
    }

    reply.code(appError.statusCode).send(payload);
  });

  app.setNotFoundHandler((request, reply) => {
    const requestId = String(request.id);
    const payload: ErrorPayload = {
      error: {
        code: "ROUTE_NOT_FOUND",
        message:
          "This endpoint does not exist. Check that the app is up to date and try again.",
        supportReference: requestId,
        retryable: false,
      },
    };
    request.log.warn(
      { requestId, code: "ROUTE_NOT_FOUND", statusCode: 404 },
      "Request rejected",
    );
    reply.code(404).send(payload);
  });

  registerHealthRoutes(app, { config, database });
  registerMeRoutes(app);
  registerVehicleRoutes(app, { database });
  registerDriverRoutes(app, { database });
  registerHireRoutes(app, { database });
  registerFinanceRoutes(app, { database });
  registerPlatformRoutes(app, { database });

  return app;
}

function resolveVerifier(
  config: AppConfig,
  testVerifier: TokenVerifier | null | undefined,
): TokenVerifier | null {
  if (config.auth) {
    return createTokenVerifier(config.auth);
  }
  if (config.nodeEnv === "test" && testVerifier) {
    return testVerifier;
  }
  return null;
}

function mapError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (isPostgresError(error)) {
    switch (error.code) {
      case "23505":
        if (error.constraint === "vehicles_fleet_registration_active_idx") {
          return duplicateVehicle();
        }
        return new AppError({
          statusCode: 409,
          code: "CONFLICT",
          message: "That record already exists. Refresh and try again.",
        });
      case "23503":
        return invalidReference();
      case "23514":
        return new AppError({
          statusCode: 400,
          code: "INVALID_VALUE",
          message:
            "Some values are outside the allowed range. Check the dates, amounts, and currency and try again.",
        });
      case "42501":
        return permissionDenied(
          "You do not have permission to change this record.",
        );
      case "22P02":
        return new AppError({
          statusCode: 400,
          code: "INVALID_VALUE",
          message: "One of the identifiers or values is not valid.",
        });
      case "57014":
        return new AppError({
          statusCode: 503,
          code: "REQUEST_TIMEOUT",
          message: "This is taking too long. Try again in a moment.",
          retryable: true,
          logLevel: "error",
        });
      case "40001":
      case "40P01":
        return new AppError({
          statusCode: 409,
          code: "CONFLICT_RETRY",
          message:
            "Another change affected this record. Refresh and try again.",
          retryable: true,
        });
      case "P0001":
        return new AppError({
          statusCode: 400,
          code: "INVALID_CHANGE",
          message: "That change is not allowed. Refresh and try again.",
        });
      default:
        return new AppError({
          statusCode: 500,
          code: "DATABASE_ERROR",
          message:
            "We could not save your change. Your previous data is unchanged. Try again shortly.",
          logLevel: "error",
          cause: error,
        });
    }
  }

  if (isFastifyError(error)) {
    switch (error.code) {
      case "FST_ERR_CTP_INVALID_MEDIA_TYPE":
        return new AppError({
          statusCode: 415,
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Send JSON and use the Content-Type: application/json header.",
        });
      case "FST_ERR_CTP_INVALID_JSON_BODY":
        return new AppError({
          statusCode: 400,
          code: "INVALID_JSON",
          message: "The request body is not valid JSON.",
        });
      case "FST_ERR_CTP_EMPTY_JSON_BODY":
        return new AppError({
          statusCode: 400,
          code: "EMPTY_BODY",
          message: "The request body cannot be empty. Send a JSON object.",
        });
      case "FST_ERR_CTP_BODY_TOO_LARGE":
        return new AppError({
          statusCode: 413,
          code: "BODY_TOO_LARGE",
          message: "The request is too large. Send a smaller record.",
        });
      default:
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
          return new AppError({
            statusCode: error.statusCode,
            code: "REQUEST_REJECTED",
            message:
              "The request could not be processed. Check the request and try again.",
          });
        }
    }
  }

  return new AppError({
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message:
      "The service is temporarily unavailable. Your changes were not saved. Try again shortly.",
    logLevel: "error",
    cause: error,
  });
}

function isPostgresError(
  error: unknown,
): error is Error & { code: string; constraint?: string } {
  return (
    error instanceof Error &&
    typeof (error as { code?: unknown }).code === "string" &&
    /^[0-9A-Z]{5}$/.test((error as unknown as { code: string }).code)
  );
}

function isFastifyError(
  error: unknown,
): error is Error & { code?: string; statusCode?: number } {
  return error instanceof Error;
}
