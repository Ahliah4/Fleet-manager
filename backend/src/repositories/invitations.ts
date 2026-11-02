import type { PoolClient } from "@neondatabase/serverless";
import type { FleetRole } from "../domain/permissions.js";

export interface MembershipInvitation {
  id: string;
  invitedEmail: string;
  role: Exclude<FleetRole, "fleet_owner">;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

export interface CreateMembershipInvitationInput {
  email: string;
  role: Exclude<FleetRole, "fleet_owner">;
  expiresAt: Date;
}

const INVITATION_COLUMNS = `
  id,
  invited_email AS "invitedEmail",
  role,
  status,
  invited_at AS "invitedAt",
  expires_at AS "expiresAt",
  accepted_at AS "acceptedAt",
  revoked_at AS "revokedAt"`;

export async function listMembershipInvitations(
  client: PoolClient,
  fleetId: string,
): Promise<MembershipInvitation[]> {
  const result = await client.query<MembershipInvitation>(
    `SELECT ${INVITATION_COLUMNS}
     FROM fleet_invitations
     WHERE fleet_id = $1
     ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, invited_at DESC, id DESC`,
    [fleetId],
  );
  return result.rows;
}

export async function createMembershipInvitation(
  client: PoolClient,
  fleetId: string,
  invitedBy: string,
  input: CreateMembershipInvitationInput,
): Promise<MembershipInvitation> {
  const result = await client.query<MembershipInvitation>(
    `INSERT INTO fleet_invitations (
       fleet_id, invited_email, role, invited_by, expires_at
     ) VALUES ($1, $2, $3::fleet_role, $4, $5)
     RETURNING ${INVITATION_COLUMNS}`,
    [fleetId, input.email, input.role, invitedBy, input.expiresAt],
  );
  const invitation = result.rows[0];
  if (!invitation) throw new Error("Invitation creation did not return a record.");
  return invitation;
}

export async function revokeMembershipInvitation(
  client: PoolClient,
  fleetId: string,
  invitationId: string,
): Promise<MembershipInvitation | null> {
  const result = await client.query<MembershipInvitation>(
    `UPDATE fleet_invitations
     SET status = 'revoked', revoked_at = now()
     WHERE id = $1 AND fleet_id = $2 AND status = 'pending'
     RETURNING ${INVITATION_COLUMNS}`,
    [invitationId, fleetId],
  );
  return result.rows[0] ?? null;
}

export interface AcceptedMembershipInvitation {
  membershipId: string;
  fleetId: string;
  role: Exclude<FleetRole, "fleet_owner">;
}

export async function acceptMembershipInvitation(
  client: PoolClient,
  invitationId: string,
): Promise<AcceptedMembershipInvitation | null> {
  const result = await client.query<AcceptedMembershipInvitation>(
    `SELECT membership_id AS "membershipId", fleet_id AS "fleetId", role
     FROM app_security.accept_fleet_invitation($1::uuid)`,
    [invitationId],
  );
  return result.rows[0] ?? null;
}
