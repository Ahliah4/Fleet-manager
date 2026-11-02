import type { Pool, PoolClient } from "@neondatabase/serverless";
import type { FleetSession, Session, SessionMembership } from "../domain/session.js";
import type { FleetRole } from "../domain/permissions.js";

export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('statement_timeout', '5s', true),
              set_config('idle_in_transaction_session_timeout', '10s', true),
              set_config('TimeZone', 'UTC', true)`,
    );
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The client is released below; the original error remains the useful one.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function setLocal(
  client: PoolClient,
  key: string,
  value: string,
): Promise<void> {
  await client.query("SELECT set_config($1, $2, true)", [key, value]);
}

export async function setFleetContext(
  client: PoolClient,
  session: FleetSession,
): Promise<void> {
  assertUuid(session.user.id, "user id");
  assertUuid(session.membership.fleet.id, "fleet id");
  assertRole(session.membership.role);

  await setLocal(client, "app.user_id", session.user.id);
  await setLocal(client, "app.fleet_id", session.membership.fleet.id);
  await setLocal(client, "app.role", session.membership.role);
  await setLocal(client, "app.permissions", session.membership.permissions.join(","));
}

export async function setPlatformContext(
  client: PoolClient,
  session: Session,
): Promise<void> {
  assertUuid(session.user.id, "user id");
  await setLocal(client, "app.user_id", session.user.id);
  await setLocal(client, "app.fleet_id", "");
  await setLocal(client, "app.role", "");
  await setLocal(client, "app.permissions", "");
}

export async function setUserContext(
  client: PoolClient,
  session: Session,
): Promise<void> {
  assertUuid(session.user.id, "user id");
  await setLocal(client, "app.user_id", session.user.id);
  await setLocal(client, "app.fleet_id", "");
  await setLocal(client, "app.role", "");
  await setLocal(client, "app.permissions", "");
}

export async function withFleetTransaction<T>(
  pool: Pool,
  session: FleetSession,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(pool, async (client) => {
    await setFleetContext(client, session);
    return work(client);
  });
}

export async function withPlatformTransaction<T>(
  pool: Pool,
  session: Session,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(pool, async (client) => {
    await setPlatformContext(client, session);
    return work(client);
  });
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLES: readonly FleetRole[] = [
  "fleet_owner",
  "fleet_admin",
  "fleet_manager",
  "finance_manager",
  "fleet_member",
  "read_only",
];

export function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label} in the authenticated session.`);
  }
}

function assertRole(role: string): asserts role is FleetRole {
  if (!(ROLES as readonly string[]).includes(role)) {
    throw new Error("Invalid fleet role in the authenticated session.");
  }
}

export function isSessionMembership(
  membership: SessionMembership | null,
): membership is SessionMembership {
  return membership !== null;
}
