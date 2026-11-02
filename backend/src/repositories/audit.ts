import type { PoolClient } from "@neondatabase/serverless";

export type AuditActorType = "user" | "platform_admin" | "system";

export interface AuditEventInput {
  actorUserId: string;
  actorType: AuditActorType;
  fleetId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  reason?: string | null;
  correlationId: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordAuditEvent(
  client: PoolClient,
  input: AuditEventInput,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (
       actor_user_id, actor_type, fleet_id, action, target_type, target_id,
       reason, correlation_id, ip, user_agent, metadata
     ) VALUES ($1, $2::audit_actor_type, $3, $4, $5, $6, $7, $8, $9::inet, $10, $11::jsonb)`,
    [
      input.actorUserId,
      input.actorType,
      input.fleetId,
      input.action.slice(0, 120),
      input.targetType ?? null,
      input.targetId ?? null,
      input.reason?.slice(0, 500) ?? null,
      input.correlationId,
      input.ip ?? null,
      input.userAgent?.slice(0, 500) ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}
