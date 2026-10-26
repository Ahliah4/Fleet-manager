import type { FastifyInstance } from "fastify";
import { hasAnyPermission } from "../domain/permissions.js";
import { permissionDenied } from "../domain/errors.js";
import type { Database } from "../db/database.js";
import { recordAuditEvent } from "../repositories/audit.js";
import {
  createVehicle,
  listVehicles,
  requireVehicle,
  restoreVehicle,
  softDeleteVehicle,
  updateVehicle,
  type VehicleRecord,
} from "../repositories/vehicles.js";
import {
  assertVehicleWriteAllowed,
  fleetSession,
  pagination,
  parseInput,
  requirePermission,
  requestAuditFields,
} from "./http.js";
import {
  vehicleBodySchema,
  vehicleIdParamsSchema,
  vehicleQuerySchema,
  vehicleUpdateSchema,
} from "./schemas.js";

const VEHICLE_READ_PERMISSIONS = [
  "fleet.vehicles.read",
  "finance.context.read",
] as const;

export function registerVehicleRoutes(
  app: FastifyInstance,
  dependencies: { database: Database },
): void {
  app.get(
    "/v1/vehicles",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request) => {
      const session = fleetSession(request);
      if (!hasAnyPermission(session.membership.permissions, VEHICLE_READ_PERMISSIONS)) {
        throw permissionDenied("You do not have permission to view vehicles.");
      }
      const query = parseInput(vehicleQuerySchema, request.query);
      const result = await dependencies.database.withFleet(session, (client) =>
        listVehicles(client, session.membership.fleet.id, query),
      );
      const fullRead = session.membership.permissions.includes("fleet.vehicles.read");
      return {
        vehicles: result.items.map((vehicle) => projectVehicle(vehicle, fullRead)),
        pagination: pagination(result.total, result.limit, result.offset),
      };
    },
  );

  app.post(
    "/v1/vehicles",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request, reply) => {
      const session = fleetSession(request);
      requirePermission(session, "fleet.vehicles.create");
      assertVehicleWriteAllowed(session);
      const body = parseInput(vehicleBodySchema, request.body);
      const audit = requestAuditFields(request);

      const vehicle = await dependencies.database.withFleet(session, async (client) => {
        const created = await createVehicle(client, session, body);
        await recordAuditEvent(client, {
          actorUserId: session.user.id,
          actorType: "user",
          fleetId: session.membership.fleet.id,
          action: "vehicle.created",
          targetType: "vehicle",
          targetId: created.id,
          correlationId: audit.correlationId,
          ip: audit.ip,
          userAgent: audit.userAgent,
          metadata: { registrationNumber: created.registrationNumber },
        });
        return created;
      });

      reply.code(201);
      return { vehicle };
    },
  );

  app.get(
    "/v1/vehicles/:vehicleId",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request) => {
      const session = fleetSession(request);
      if (!hasAnyPermission(session.membership.permissions, VEHICLE_READ_PERMISSIONS)) {
        throw permissionDenied("You do not have permission to view vehicles.");
      }
      const { vehicleId } = parseInput(vehicleIdParamsSchema, request.params);
      const vehicle = await dependencies.database.withFleet(session, (client) =>
        requireVehicle(client, session.membership.fleet.id, vehicleId),
      );
      const fullRead = session.membership.permissions.includes("fleet.vehicles.read");
      return { vehicle: projectVehicle(vehicle, fullRead) };
    },
  );

  app.patch(
    "/v1/vehicles/:vehicleId",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request) => {
      const session = fleetSession(request);
      requirePermission(session, "fleet.vehicles.update");
      assertVehicleWriteAllowed(session);
      const { vehicleId } = parseInput(vehicleIdParamsSchema, request.params);
      const body = parseInput(vehicleUpdateSchema, request.body);
      const audit = requestAuditFields(request);

      const vehicle = await dependencies.database.withFleet(session, async (client) => {
        const updated = await updateVehicle(client, session, vehicleId, body);
        await recordAuditEvent(client, {
          actorUserId: session.user.id,
          actorType: "user",
          fleetId: session.membership.fleet.id,
          action: "vehicle.updated",
          targetType: "vehicle",
          targetId: updated.id,
          correlationId: audit.correlationId,
          ip: audit.ip,
          userAgent: audit.userAgent,
          metadata: { fields: Object.keys(body).sort() },
        });
        return updated;
      });

      return { vehicle };
    },
  );

  app.delete(
    "/v1/vehicles/:vehicleId",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request) => {
      const session = fleetSession(request);
      requirePermission(
        session,
        "fleet.vehicles.delete",
        "Only fleet owners, administrators, and managers can remove vehicles.",
      );
      const { vehicleId } = parseInput(vehicleIdParamsSchema, request.params);
      const audit = requestAuditFields(request);

      const vehicle = await dependencies.database.withFleet(session, async (client) => {
        const deleted = await softDeleteVehicle(client, session, vehicleId);
        await recordAuditEvent(client, {
          actorUserId: session.user.id,
          actorType: "user",
          fleetId: session.membership.fleet.id,
          action: "vehicle.deleted",
          targetType: "vehicle",
          targetId: deleted.id,
          correlationId: audit.correlationId,
          ip: audit.ip,
          userAgent: audit.userAgent,
          metadata: { registrationNumber: deleted.registrationNumber },
        });
        return deleted;
      });

      return { vehicle, deleted: true };
    },
  );

  app.post(
    "/v1/vehicles/:vehicleId/restore",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request) => {
      const session = fleetSession(request);
      requirePermission(
        session,
        "fleet.vehicles.restore",
        "Only fleet owners, administrators, and managers can restore vehicles.",
      );
      const { vehicleId } = parseInput(vehicleIdParamsSchema, request.params);
      const audit = requestAuditFields(request);

      const vehicle = await dependencies.database.withFleet(session, async (client) => {
        const restored = await restoreVehicle(client, session, vehicleId);
        await recordAuditEvent(client, {
          actorUserId: session.user.id,
          actorType: "user",
          fleetId: session.membership.fleet.id,
          action: "vehicle.restored",
          targetType: "vehicle",
          targetId: restored.id,
          correlationId: audit.correlationId,
          ip: audit.ip,
          userAgent: audit.userAgent,
          metadata: { registrationNumber: restored.registrationNumber },
        });
        return restored;
      });

      return { vehicle, restored: true };
    },
  );
}

function projectVehicle(vehicle: VehicleRecord, fullRead: boolean) {
  if (fullRead) {
    return vehicle;
  }
  return {
    id: vehicle.id,
    registrationNumber: vehicle.registrationNumber,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
  };
}
