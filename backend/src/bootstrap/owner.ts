import type { Client } from "@neondatabase/serverless";

/**
 * Development-only provisioning for the first Fleet Owner.
 *
 * The operation is deliberately separate from public signup. It creates one
 * application user, one active fleet, and one active fleet_owner membership in a
 * single transaction. Re-running it is safe: an already-provisioned owner is
 * verified and left in place instead of creating another fleet or membership.
 */

export interface BootstrapOwnerInput {
  subject: string;
  email: string;
  displayName: string;
  fleetName: string;
}

export type BootstrapStage =
  | "connect"
  | "configuration"
  | "begin_transaction"
  | "lock_bootstrap"
  | "lookup_identity"
  | "lookup_email"
  | "validate_identity"
  | "upsert_user"
  | "inspect_membership"
  | "inspect_owned_fleets"
  | "inspect_fleet_owner"
  | "inspect_prior_memberships"
  | "create_fleet"
  | "create_membership"
  | "verify_membership"
  | "commit_transaction"
  | "unknown";

export type BootstrapOwnerOutcome = "created" | "repaired" | "already_bootstrapped";

export interface BootstrapOwnerResult {
  outcome: BootstrapOwnerOutcome;
  fleetCreated: boolean;
  membershipCreated: boolean;
}

export class BootstrapFailure extends Error {
  readonly stage: BootstrapStage;
  readonly code?: string;

  constructor(
    stage: BootstrapStage,
    message: string,
    options: { code?: string; cause?: unknown } = {},
  ) {
    super(redactSensitive(message), { cause: options.cause });
    this.name = "BootstrapFailure";
    this.stage = stage;
    this.code = sanitizeCode(options.code);
  }
}

// A transaction-scoped advisory lock serialises concurrent operator runs without
// holding a lock on the tables while the operator is still typing.
const BOOTSTRAP_LOCK_ID = 7_364_920_2;

interface UserRow {
  id: string;
  email: string;
  status: string;
}

interface EmailRow {
  id: string;
  idp_subject: string;
  status: string;
}

interface MembershipRow {
  id: string;
  fleet_id: string;
  role: string;
  status: string;
  fleet_status: string;
  owner_user_id: string | null;
}

interface FleetRow {
  id: string;
  name: string;
  status: string;
  owner_user_id: string | null;
}

interface PriorMembershipRow {
  id: string;
  fleet_id: string;
  role: string;
  status: string;
}

interface OwnerMembershipRow {
  user_id: string;
}

interface CountRow {
  owner_count: number | string;
  active_count: number | string;
}

export async function bootstrapOwner(
  client: Client,
  input: BootstrapOwnerInput,
): Promise<BootstrapOwnerResult> {
  const normalized = normalizeInput(input);
  let stage: BootstrapStage = "begin_transaction";
  let inTransaction = false;

  try {
    await client.query("BEGIN");
    inTransaction = true;

    stage = "lock_bootstrap";
    await client.query("SELECT pg_advisory_xact_lock($1)", [BOOTSTRAP_LOCK_ID]);

    stage = "lookup_identity";
    const subjectRows = await client.query<UserRow>(
      `SELECT id, email, status
       FROM users
       WHERE idp_subject = $1
       LIMIT 1`,
      [normalized.subject],
    );
    const subjectUser = subjectRows.rows[0];

    stage = "lookup_email";
    const emailRows = await client.query<EmailRow>(
      `SELECT id, idp_subject, status
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [normalized.email],
    );
    const emailUser = emailRows.rows[0];

    stage = "validate_identity";
    if (subjectUser && subjectUser.email !== normalized.email) {
      throw new BootstrapFailure(
        stage,
        "The identity subject is already linked to a different email address.",
      );
    }
    if (emailUser && emailUser.idp_subject !== normalized.subject) {
      throw new BootstrapFailure(
        stage,
        "That email address is already linked to a different identity subject.",
      );
    }
    if (subjectUser && emailUser && subjectUser.id !== emailUser.id) {
      throw new BootstrapFailure(
        stage,
        "The identity subject and email address resolve to different users.",
      );
    }
    if (subjectUser && subjectUser.status !== "active") {
      throw new BootstrapFailure(
        stage,
        "That identity subject is not active. Restore it through the approved operator process instead of reactivating it here.",
      );
    }

    stage = "upsert_user";
    const userRows = await client.query<{ id: string }>(
      `INSERT INTO users (idp_subject, email, display_name, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (idp_subject) DO UPDATE
       SET email = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           updated_at = now()
       RETURNING id`,
      [normalized.subject, normalized.email, normalized.displayName],
    );
    const userId = userRows.rows[0]?.id;
    if (!userId) {
      throw new BootstrapFailure(stage, "The owner account could not be created or updated.");
    }

    stage = "inspect_membership";
    const activeMembershipRows = await client.query<MembershipRow>(
      `SELECT m.id,
              m.fleet_id,
              m.role,
              m.status,
              f.status AS fleet_status,
              f.owner_user_id
       FROM fleet_memberships m
       JOIN fleets f ON f.id = m.fleet_id
       WHERE m.user_id = $1
         AND m.status = 'active'
       FOR UPDATE OF m, f`,
      [userId],
    );
    if (activeMembershipRows.rows.length > 1) {
      throw new BootstrapFailure(
        stage,
        "This identity has more than one active membership. Resolve the duplicate before retrying.",
      );
    }

    const activeMembership = activeMembershipRows.rows[0];
    if (activeMembership) {
      if (activeMembership.role !== "fleet_owner") {
        throw new BootstrapFailure(
          stage,
          `This identity already has an active ${activeMembership.role} membership. Bootstrap will not change an existing role.`,
        );
      }
      if (activeMembership.fleet_status !== "active") {
        throw new BootstrapFailure(
          stage,
          "The fleet linked to this active owner membership is not active. Restore it through the approved operator process.",
        );
      }
      if (activeMembership.owner_user_id !== userId) {
        throw new BootstrapFailure(
          stage,
          "The active fleet does not point to this identity as its owner. Resolve the ownership mismatch before retrying.",
        );
      }

      await verifyOwnerMembership(client, userId, activeMembership.fleet_id);
      stage = "commit_transaction";
      await client.query("COMMIT");
      return {
        outcome: "already_bootstrapped",
        fleetCreated: false,
        membershipCreated: false,
      };
    }

    stage = "inspect_owned_fleets";
    const ownedFleetRows = await client.query<FleetRow>(
      `SELECT id, name, status, owner_user_id
       FROM fleets
       WHERE owner_user_id = $1
       ORDER BY created_at, id
       FOR UPDATE`,
      [userId],
    );
    if (ownedFleetRows.rows.length > 1) {
      throw new BootstrapFailure(
        stage,
        "This identity owns more than one fleet. Bootstrap requires exactly one owned fleet.",
      );
    }

    let fleetId: string;
    let fleetCreated = false;
    let membershipCreated = true;

    if (ownedFleetRows.rows[0]) {
      const ownedFleet = ownedFleetRows.rows[0];
      if (ownedFleet.status !== "active") {
        throw new BootstrapFailure(
          stage,
          "This identity owns a fleet that is not active. Restore it through the approved operator process.",
        );
      }
      fleetId = ownedFleet.id;

      stage = "inspect_fleet_owner";
      const fleetOwnerRows = await client.query<OwnerMembershipRow>(
        `SELECT user_id
         FROM fleet_memberships
         WHERE fleet_id = $1
           AND role = 'fleet_owner'
           AND status = 'active'
         LIMIT 1
         FOR UPDATE`,
        [fleetId],
      );
      const fleetOwner = fleetOwnerRows.rows[0];
      if (fleetOwner && fleetOwner.user_id !== userId) {
        throw new BootstrapFailure(
          stage,
          "The owned fleet already has a different active owner membership. Resolve it before retrying.",
        );
      }

      stage = "inspect_prior_memberships";
      const priorRows = await client.query<PriorMembershipRow>(
        `SELECT id, fleet_id, role, status
         FROM fleet_memberships
         WHERE user_id = $1
         ORDER BY created_at, id
         FOR UPDATE`,
        [userId],
      );
      const prior = priorRows.rows;
      const priorElsewhere = prior.find((row) => row.fleet_id !== fleetId);
      if (priorElsewhere) {
        throw new BootstrapFailure(
          stage,
          "This identity has prior membership history in another fleet. Resolve it before retrying.",
        );
      }
      const priorHere = prior.find((row) => row.fleet_id === fleetId);
      if (priorHere) {
        if (priorHere.status === "suspended" || priorHere.status === "removed") {
          throw new BootstrapFailure(
            stage,
            "This identity has a suspended or removed membership in the owned fleet. Restore it through the approved operator process instead of silently reactivating it.",
          );
        }
        membershipCreated = priorHere.status !== "active";
      }
    } else {
      stage = "inspect_prior_memberships";
      const priorRows = await client.query<PriorMembershipRow>(
        `SELECT id, fleet_id, role, status
         FROM fleet_memberships
         WHERE user_id = $1
         ORDER BY created_at, id
         FOR UPDATE`,
        [userId],
      );
      if (priorRows.rows.length > 0) {
        throw new BootstrapFailure(
          stage,
          "This identity has prior membership history. Resolve it before creating a new owner fleet.",
        );
      }

      stage = "create_fleet";
      const fleetRows = await client.query<{ id: string }>(
        `INSERT INTO fleets (name, status, owner_user_id)
         VALUES ($1, 'active', $2)
         RETURNING id`,
        [normalized.fleetName, userId],
      );
      fleetId = fleetRows.rows[0]?.id ?? "";
      if (!fleetId) {
        throw new BootstrapFailure(stage, "The fleet could not be created.");
      }
      fleetCreated = true;
    }

    stage = "create_membership";
    const membershipRows = await client.query<{ id: string }>(
      `INSERT INTO fleet_memberships (fleet_id, user_id, role, status, joined_at)
       VALUES ($1, $2, 'fleet_owner', 'active', now())
       ON CONFLICT (fleet_id, user_id) DO UPDATE
       SET role = 'fleet_owner',
           status = 'active',
           invited_by = NULL,
           invited_at = NULL,
           joined_at = COALESCE(fleet_memberships.joined_at, now()),
           suspended_at = NULL,
           removed_at = NULL,
           updated_at = now()
       RETURNING id`,
      [fleetId, userId],
    );
    if (!membershipRows.rows[0]?.id) {
      throw new BootstrapFailure(stage, "The owner membership could not be created.");
    }

    await verifyOwnerMembership(client, userId, fleetId);

    stage = "commit_transaction";
    await client.query("COMMIT");
    return {
      outcome: fleetCreated ? "created" : "repaired",
      fleetCreated,
      membershipCreated,
    };
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    if (error instanceof BootstrapFailure) {
      throw error;
    }
    throw toBootstrapFailure(stage, error);
  }
}

async function verifyOwnerMembership(
  client: Client,
  userId: string,
  fleetId: string,
): Promise<void> {
  const verification = await client.query<CountRow>(
    `SELECT
       count(*) FILTER (
         WHERE m.fleet_id = $2
           AND m.role = 'fleet_owner'
           AND f.status = 'active'
           AND f.owner_user_id = $1
       )::int AS owner_count,
       count(*)::int AS active_count
     FROM fleet_memberships m
     JOIN fleets f ON f.id = m.fleet_id
     WHERE m.user_id = $1
       AND m.status = 'active'`,
    [userId, fleetId],
  );
  const counts = verification.rows[0];
  if (
    !counts ||
    Number(counts.owner_count) !== 1 ||
    Number(counts.active_count) !== 1
  ) {
    throw new BootstrapFailure(
      "verify_membership",
      "The owner membership could not be verified after the change.",
    );
  }
}

function normalizeInput(input: BootstrapOwnerInput): BootstrapOwnerInput {
  const subject = input.subject.trim();
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const fleetName = input.fleetName.trim();

  if (!subject || subject.length > 255) {
    throw new BootstrapFailure("configuration", "The identity subject is not valid.");
  }
  if (!email.includes("@") || email.length < 3 || email.length > 320) {
    throw new BootstrapFailure("configuration", "The owner email is not valid.");
  }
  if (!displayName || displayName.length > 120) {
    throw new BootstrapFailure("configuration", "The display name is not valid.");
  }
  if (!fleetName || fleetName.length > 80) {
    throw new BootstrapFailure("configuration", "The fleet name is not valid.");
  }

  return { subject, email, displayName, fleetName };
}

export function toBootstrapFailure(
  stage: BootstrapStage,
  error: unknown,
): BootstrapFailure {
  if (error instanceof BootstrapFailure) {
    return error;
  }
  return new BootstrapFailure(stage, messageFrom(error, stage), {
    code: extractCode(error),
    cause: error,
  });
}

export function formatSafeError(error: unknown): string {
  const failure =
    error instanceof BootstrapFailure
      ? error
      : toBootstrapFailure("unknown", error);
  const code = failure.code ? ` code=${failure.code}` : "";
  const message = redactSensitive(failure.message) || "No error message was provided.";
  return `stage=${failure.stage}${code} message=${message}`;
}

export function redactSensitive(value: string): string {
  return value
    .replace(
      /(?:postgres(?:ql)?|wss?):\/\/[^\s"'`]+/gi,
      "[database URL redacted]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [token redacted]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      "[token redacted]",
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[email redacted]",
    )
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "[uuid redacted]",
    )
    .replace(
      /\b(password|passwd|pwd|secret|token)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .trim()
    .slice(0, 500);
}

function messageFrom(error: unknown, stage: BootstrapStage): string {
  const fallback =
    stage === "connect"
      ? "The WebSocket connection ended before Neon returned an error message."
      : "No error message was provided.";

  const candidate = findMessage(error);
  if (!candidate || candidate.trim().toLowerCase() === "error") {
    return fallback;
  }
  return candidate;
}

function findMessage(error: unknown): string | undefined {
  if (typeof error === "string") {
    return error;
  }
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const value = error as Record<string, unknown>;
  const candidates = [
    value.message,
    (value.error as Record<string, unknown> | undefined)?.message,
    (value.reason as Record<string, unknown> | undefined)?.message,
    (value.cause as Record<string, unknown> | undefined)?.message,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return undefined;
}

function extractCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const value = error as Record<string, unknown>;
  const candidates = [
    value.code,
    (value.error as Record<string, unknown> | undefined)?.code,
    (value.cause as Record<string, unknown> | undefined)?.code,
  ];
  for (const candidate of candidates) {
    const code = sanitizeCode(candidate);
    if (code) {
      return code;
    }
  }
  return undefined;
}

function sanitizeCode(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(value)
    ? value
    : undefined;
}
