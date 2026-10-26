import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import {
  noActiveFleet,
  permissionDenied,
  validationFailed,
} from "../domain/errors.js";
import { hasPermission, type Permission } from "../domain/permissions.js";
import type { FleetSession, Session } from "../domain/session.js";

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationFailed(result.error);
  }
  return result.data;
}

export function authenticatedSession(request: FastifyRequest): Session {
  const session = request.session;
  if (!session) {
    throw new Error("Authenticated session missing after authentication.");
  }
  return session;
}

export function fleetSession(request: FastifyRequest): FleetSession {
  const session = request.session;
  if (!session?.membership) {
    throw noActiveFleet();
  }
  return session as FleetSession;
}

export function requirePermission(
  session: FleetSession,
  permission: Permission,
  message?: string,
): void {
  if (!hasPermission(session.membership.permissions, permission)) {
    throw permissionDenied(message);
  }
}

export function assertVehicleWriteAllowed(session: FleetSession): void {
  if (
    session.membership.role === "fleet_member" &&
    !session.membership.fleet.policy.memberCanWrite
  ) {
    throw permissionDenied(
      "Fleet members cannot add or edit vehicles while this fleet policy is off. Ask your fleet owner to enable member vehicle updates.",
    );
  }
}

export function requestAuditFields(request: FastifyRequest): {
  correlationId: string;
  ip: string | null;
  userAgent: string | null;
} {
  const userAgent = request.headers["user-agent"];
  return {
    correlationId: String(request.id),
    ip: request.ip || null,
    userAgent: typeof userAgent === "string" ? userAgent : null,
  };
}

export function pagination(total: number, limit: number, offset: number) {
  return { total, limit, offset };
}
