import type { FastifyInstance } from "fastify";
import type { Database } from "../db/database.js";
import { recordAuditEvent } from "../repositories/audit.js";
import {
  createHire,
  listHires,
  requireHire,
  updateHire,
} from "../repositories/hires.js";
import {
  fleetSession,
  pagination,
  parseInput,
  requirePermission,
  requestAuditFields,
} from "./http.js";
import {
  hireBodySchema,
  hireIdParamsSchema,
  hireQuerySchema,
  hireUpdateSchema,
} from "./schemas.js";

export function registerHireRoutes(
  app: FastifyInstance,
  dependencies: { database: Database },
): void {
  app.get(
    "/v1/hires",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request) => {
      const session = fleetSession(request);
      requirePermission(session, "fleet.operations.read");
      const query = parseInput(hireQuerySchema, request.query);
      const result = await dependencies.database.withFleet(session, (client) =>
        listHires(client, session.membership.fleet.id, query),
      );
      return {
        hires: result.items,
        pagination: pagination(result.total, result.limit, result.offset),
      };
    },
  );

  app.post(
    "/v1/hires",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request, reply) => {
      const session = fleetSession(request);
      requirePermission(session, "fleet.operations.manage");
      const body = parseInput(hireBodySchema, request.body);
      const audit = requestAuditFields(request);

      const hire = await dependencies.database.withFleet(session, async (client) => {
        const created = await createHire(client, session, body);
        await recordAuditEvent(client, {
          actorUserId: session.user.id,
          actorType: "user",
          fleetId: session.membership.fleet.id,
          action: "hire.created",
          targetType: "hire",
          targetId: created.id,
          correlationId: audit.correlationId,
          ip: audit.ip,
          userAgent: audit.userAgent,
          metadata: { status: created.status },
        });
        return created;
      });

      reply.code(201);
      return { hire };
    },
  );

  app.get(
    "/v1/hires/:hireId",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request) => {
      const session = fleetSession(request);
      requirePermission(session, "fleet.operations.read");
      const { hireId } = parseInput(hireIdParamsSchema, request.params);
      const hire = await dependencies.database.withFleet(session, (client) =>
        requireHire(client, session.membership.fleet.id, hireId),
      );
      return { hire };
    },
  );

  app.patch(
    "/v1/hires/:hireId",
    { preHandler: [app.authenticate, app.requireFleet] },
    async (request) => {
      const session = fleetSession(request);
      requirePermission(session, "fleet.operations.manage");
      const { hireId } = parseInput(hireIdParamsSchema, request.params);
      const body = parseInput(hireUpdateSchema, request.body);
      const audit = requestAuditFields(request);

      const hire = await dependencies.database.withFleet(session, async (client) => {
        const updated = await updateHire(client, session, hireId, body);
        await recordAuditEvent(client, {
          actorUserId: session.user.id,
          actorType: "user",
          fleetId: session.membership.fleet.id,
          action: "hire.updated",
          targetType: "hire",
          targetId: updated.id,
          correlationId: audit.correlationId,
          ip: audit.ip,
          userAgent: audit.userAgent,
          metadata: { fields: Object.keys(body).sort() },
        });
        return updated;
      });

      return { hire };
    },
  );
}
