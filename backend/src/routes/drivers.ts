import type { FastifyInstance } from "fastify";
import { hasAnyPermission } from "../domain/permissions.js";
import { permissionDenied } from "../domain/errors.js";
import type { Database } from "../db/database.js";
import { recordAuditEvent } from "../repositories/audit.js";
import {
  createDriver,
  listDrivers,
  requireDriver,
  updateDriver,
  type DriverRecord,
} from "../repositories/drivers.js";
import {
  fleetSession,
  pagination,
  parseInput,
  requirePermission,
  requestAuditFields,
} from "./http.js";
import {
  driverBodySchema,
  driverIdParamsSchema,
  driverQuerySchema,
  driverUpdateSchema,
} from "./schemas.js";

const DRIVER_READ_PERMISSIONS = [
  "fleet.operations.read",
  "finance.context.read",
] as const;

export function registerDriverRoutes(
  app: FastifyInstance,
  dependencies: { database: Database },
): void {
  app.get(
    "/v1/drivers",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request) => {
      const session = fleetSession(request);
      if (!hasAnyPermission(session.membership.permissions, DRIVER_READ_PERMISSIONS)) {
        throw permissionDenied("You do not have permission to view drivers.");
      }
      const query = parseInput(driverQuerySchema, request.query);
      const result = await dependencies.database.withFleet(session, (client) =>
        listDrivers(client, session.membership.fleet.id, query),
      );
      const fullRead = session.membership.permissions.includes("fleet.operations.read");
      return {
        drivers: result.items.map((driver) => projectDriver(driver, fullRead)),
        pagination: pagination(result.total, result.limit, result.offset),
      };
    },
  );

  app.post(
    "/v1/drivers",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request, reply) => {
      const session = fleetSession(request);
      requirePermission(session, "fleet.operations.manage");
      const body = parseInput(driverBodySchema, request.body);
      const audit = requestAuditFields(request);

      const driver = await dependencies.database.withFleet(session, async (client) => {
        const created = await createDriver(client, session, body);
        await recordAuditEvent(client, {
          actorUserId: session.user.id,
          actorType: "user",
          fleetId: session.membership.fleet.id,
          action: "driver.created",
          targetType: "driver",
          targetId: created.id,
          correlationId: audit.correlationId,
          ip: audit.ip,
          userAgent: audit.userAgent,
          metadata: { status: created.status },
        });
        return created;
      });

      reply.code(201);
      return { driver };
    },
  );

  app.get(
    "/v1/drivers/:driverId",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request) => {
      const session = fleetSession(request);
      if (!hasAnyPermission(session.membership.permissions, DRIVER_READ_PERMISSIONS)) {
        throw permissionDenied("You do not have permission to view drivers.");
      }
      const { driverId } = parseInput(driverIdParamsSchema, request.params);
      const driver = await dependencies.database.withFleet(session, (client) =>
        requireDriver(client, session.membership.fleet.id, driverId),
      );
      const fullRead = session.membership.permissions.includes("fleet.operations.read");
      return { driver: projectDriver(driver, fullRead) };
    },
  );

  app.patch(
    "/v1/drivers/:driverId",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request) => {
      const session = fleetSession(request);
      requirePermission(session, "fleet.operations.manage");
      const { driverId } = parseInput(driverIdParamsSchema, request.params);
      const body = parseInput(driverUpdateSchema, request.body);
      const audit = requestAuditFields(request);

      const driver = await dependencies.database.withFleet(session, async (client) => {
        const updated = await updateDriver(client, session, driverId, body);
        await recordAuditEvent(client, {
          actorUserId: session.user.id,
          actorType: "user",
          fleetId: session.membership.fleet.id,
          action: "driver.updated",
          targetType: "driver",
          targetId: updated.id,
          correlationId: audit.correlationId,
          ip: audit.ip,
          userAgent: audit.userAgent,
          metadata: { fields: Object.keys(body).sort() },
        });
        return updated;
      });

      return { driver };
    },
  );
}

function projectDriver(driver: DriverRecord, fullRead: boolean) {
  if (fullRead) {
    return driver;
  }
  return {
    id: driver.id,
    fullName: driver.fullName,
    status: driver.status,
  };
}
