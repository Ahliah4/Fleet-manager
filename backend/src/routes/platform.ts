import type { FastifyInstance } from "fastify";
import { notFound } from "../domain/errors.js";
import { paginationSchema } from "../domain/validation.js";
import type { Database } from "../db/database.js";
import { recordAuditEvent } from "../repositories/audit.js";
import {
  listPlatformFleets,
  platformFleetExists,
} from "../repositories/platform.js";
import { listVehicles } from "../repositories/vehicles.js";
import {
  authenticatedSession,
  pagination,
  parseInput,
  requestAuditFields,
} from "./http.js";
import { platformFleetParamsSchema, vehicleQuerySchema } from "./schemas.js";

export function registerPlatformRoutes(
  app: FastifyInstance,
  dependencies: { database: Database },
): void {
  const preHandler = [app.authenticate, app.requirePlatformAdmin];

  app.get("/v1/platform/fleets", { preHandler }, async (request) => {
    const session = authenticatedSession(request);
    const query = parseInput(paginationSchema, request.query);
    const audit = requestAuditFields(request);

    const result = await dependencies.database.withPlatform(session, async (client) => {
      const page = await listPlatformFleets(client, query);
      await recordAuditEvent(client, {
        actorUserId: session.user.id,
        actorType: "platform_admin",
        fleetId: null,
        action: "platform.fleets_read",
        targetType: "fleet_directory",
        correlationId: audit.correlationId,
        ip: audit.ip,
        userAgent: audit.userAgent,
        metadata: {
          count: page.items.length,
          limit: page.limit,
          offset: page.offset,
        },
      });
      return page;
    });

    return {
      fleets: result.items,
      pagination: pagination(result.total, result.limit, result.offset),
    };
  });

  app.get(
    "/v1/platform/fleets/:fleetId/vehicles",
    { preHandler },
    async (request) => {
      const session = authenticatedSession(request);
      const { fleetId } = parseInput(platformFleetParamsSchema, request.params);
      const query = parseInput(vehicleQuerySchema, request.query);
      const audit = requestAuditFields(request);

      const result = await dependencies.database.withPlatform(session, async (client) => {
        if (!(await platformFleetExists(client, fleetId))) {
          throw notFound("We could not find that fleet.");
        }
        const vehicles = await listVehicles(client, fleetId, query);
        await recordAuditEvent(client, {
          actorUserId: session.user.id,
          actorType: "platform_admin",
          fleetId,
          action: "platform.vehicles_read",
          targetType: "fleet",
          targetId: fleetId,
          correlationId: audit.correlationId,
          ip: audit.ip,
          userAgent: audit.userAgent,
          metadata: {
            count: vehicles.items.length,
            limit: query.limit,
            offset: query.offset,
          },
        });
        return vehicles;
      });

      return {
        vehicles: result.items,
        pagination: pagination(result.total, result.limit, result.offset),
      };
    },
  );
}
