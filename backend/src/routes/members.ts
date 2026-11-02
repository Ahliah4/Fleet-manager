import type { FastifyInstance } from "fastify";
import { notFound, permissionDenied } from "../domain/errors.js";
import type { FleetRole } from "../domain/permissions.js";
import type { Database } from "../db/database.js";
import { recordAuditEvent } from "../repositories/audit.js";
import {
  acceptMembershipInvitation,
  createMembershipInvitation,
  listMembershipInvitations,
  revokeMembershipInvitation,
} from "../repositories/invitations.js";
import { fleetSession, parseInput, requestAuditFields, requirePermission } from "./http.js";
import {
  membershipInvitationBodySchema,
  membershipInvitationParamsSchema,
} from "./schemas.js";

const INVITATION_TTL_DAYS = 7;

export function registerMemberRoutes(
  app: FastifyInstance,
  dependencies: { database: Database },
): void {
  const preHandler = [app.authenticate, app.requireFleet];

  app.get("/v1/members/invitations", { preHandler }, async (request) => {
    const session = fleetSession(request);
    requirePermission(session, "fleet.members.read", "Only fleet owners and administrators can view invitations.");
    const invitations = await dependencies.database.withFleet(session, (client) =>
      listMembershipInvitations(client, session.membership.fleet.id),
    );
    return { invitations };
  });

  app.post("/v1/members/invitations", { preHandler }, async (request, reply) => {
    const session = fleetSession(request);
    requirePermission(session, "fleet.members.manage", "Only fleet owners and administrators can invite people.");
    const body = parseInput(membershipInvitationBodySchema, request.body);
    assertRoleCanBeInvited(session.membership.role, body.role);
    const audit = requestAuditFields(request);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const invitation = await dependencies.database.withFleet(session, async (client) => {
      const created = await createMembershipInvitation(client, session.membership.fleet.id, session.user.id, {
        email: body.email,
        role: body.role,
        expiresAt,
      });
      await recordAuditEvent(client, {
        actorUserId: session.user.id,
        actorType: "user",
        fleetId: session.membership.fleet.id,
        action: "membership.invited",
        targetType: "fleet_invitation",
        targetId: created.id,
        correlationId: audit.correlationId,
        ip: audit.ip,
        userAgent: audit.userAgent,
        metadata: { role: created.role },
      });
      return created;
    });
    reply.code(201);
    return { invitation };
  });

  app.delete("/v1/members/invitations/:invitationId", { preHandler }, async (request) => {
    const session = fleetSession(request);
    requirePermission(session, "fleet.members.manage", "Only fleet owners and administrators can revoke invitations.");
    const { invitationId } = parseInput(membershipInvitationParamsSchema, request.params);
    const audit = requestAuditFields(request);
    const invitation = await dependencies.database.withFleet(session, async (client) => {
      const revoked = await revokeMembershipInvitation(client, session.membership.fleet.id, invitationId);
      if (!revoked) throw notFound("We could not find an active invitation.");
      await recordAuditEvent(client, {
        actorUserId: session.user.id,
        actorType: "user",
        fleetId: session.membership.fleet.id,
        action: "membership.invitation_revoked",
        targetType: "fleet_invitation",
        targetId: revoked.id,
        correlationId: audit.correlationId,
        ip: audit.ip,
        userAgent: audit.userAgent,
        metadata: { role: revoked.role },
      });
      return revoked;
    });
    return { invitation };
  });

  app.post(
    "/v1/members/invitations/:invitationId/accept",
    { preHandler: [app.authenticate] },
    async (request) => {
      const session = request.session;
      if (!session) throw new Error("Authenticated session missing after authentication.");
      const { invitationId } = parseInput(membershipInvitationParamsSchema, request.params);
      const invitation = await dependencies.database.withUser(session, (client) =>
        acceptMembershipInvitation(client, invitationId),
      );
      if (!invitation) {
        throw notFound("There is no active invitation for this account.");
      }
      return { invitation };
    },
  );
}

function assertRoleCanBeInvited(
  actorRole: FleetRole,
  targetRole: Exclude<FleetRole, "fleet_owner">,
): void {
  const allowedByOwner: readonly Exclude<FleetRole, "fleet_owner">[] = [
    "fleet_admin", "fleet_manager", "finance_manager", "fleet_member", "read_only",
  ];
  const allowedByAdmin: readonly Exclude<FleetRole, "fleet_owner">[] = [
    "fleet_manager", "finance_manager", "fleet_member", "read_only",
  ];
  const allowed = actorRole === "fleet_owner" ? allowedByOwner : allowedByAdmin;
  if (!allowed.includes(targetRole)) {
    throw permissionDenied(
      "Only a fleet owner can invite an administrator. Fleet Owner and Super Admin cannot be assigned through an invitation.",
    );
  }
}
