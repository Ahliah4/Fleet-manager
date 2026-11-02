import { describe, expect, it } from "vitest";
import type { Client } from "@neondatabase/serverless";
import {
  BootstrapFailure,
  bootstrapOwner,
  formatSafeError,
  redactSensitive,
  toBootstrapFailure,
  type BootstrapOwnerInput,
} from "../src/bootstrap/owner.js";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FLEET_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_FLEET_ID = "22222222-2222-4222-8222-222222222222";
const MEMBERSHIP_ID = "33333333-3333-4333-8333-333333333333";
const SUBJECT = "idp-subject-test";
const EMAIL = "owner@example.test";

interface UserRecord {
  id: string;
  idp_subject: string;
  email: string;
  display_name: string;
  status: string;
}

interface FleetRecord {
  id: string;
  name: string;
  status: string;
  owner_user_id: string | null;
  created_at: string;
}

interface MembershipRecord {
  id: string;
  fleet_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
}

type Row = Record<string, unknown>;

interface FakeState {
  users: UserRecord[];
  fleets: FleetRecord[];
  memberships: MembershipRecord[];
}

class FakeClient {
  users: UserRecord[];
  fleets: FleetRecord[];
  memberships: MembershipRecord[];
  queries: Array<{ sql: string; params: unknown[] }> = [];
  counts = { begin: 0, commit: 0, rollback: 0 };
  failOn?: { fragment: string; error: unknown };

  private snapshot: FakeState | null = null;
  private nextFleetId = 1;

  constructor(initial: Partial<FakeState> = {}) {
    this.users = initial.users ?? [];
    this.fleets = initial.fleets ?? [];
    this.memberships = initial.memberships ?? [];
  }

  async query(sql: string, params: unknown[] = []): Promise<{ rows: Row[]; rowCount: number }> {
    this.queries.push({ sql, params });
    if (this.failOn && sql.includes(this.failOn.fragment)) {
      throw this.failOn.error;
    }

    const q = sql.replace(/\s+/g, " ").trim();

    if (q === "BEGIN") {
      this.counts.begin += 1;
      this.snapshot = structuredClone({
        users: this.users,
        fleets: this.fleets,
        memberships: this.memberships,
      });
      return rows([]);
    }
    if (q === "COMMIT") {
      this.counts.commit += 1;
      this.snapshot = null;
      return rows([]);
    }
    if (q === "ROLLBACK") {
      this.counts.rollback += 1;
      if (this.snapshot) {
        this.users = this.snapshot.users;
        this.fleets = this.snapshot.fleets;
        this.memberships = this.snapshot.memberships;
        this.snapshot = null;
      }
      return rows([]);
    }
    if (q.startsWith("SELECT pg_advisory_xact_lock")) {
      return rows([{ locked: true }]);
    }
    if (q.includes("WHERE idp_subject = $1")) {
      return rows(
        this.users
          .filter((user) => user.idp_subject === String(params[0]))
          .map((user) => ({
            id: user.id,
            email: user.email,
            status: user.status,
          })),
      );
    }
    if (q.includes("WHERE email = $1")) {
      return rows(
        this.users
          .filter((user) => user.email === String(params[0]))
          .map((user) => ({
            id: user.id,
            idp_subject: user.idp_subject,
            status: user.status,
          })),
      );
    }
    if (q.startsWith("INSERT INTO users")) {
      const subject = String(params[0]);
      const email = String(params[1]);
      const displayName = String(params[2]);
      const existing = this.users.find((user) => user.idp_subject === subject);
      if (existing) {
        existing.email = email;
        existing.display_name = displayName;
        return rows([{ id: existing.id }]);
      }
      const user: UserRecord = {
        id: USER_ID,
        idp_subject: subject,
        email,
        display_name: displayName,
        status: "active",
      };
      this.users.push(user);
      return rows([{ id: user.id }]);
    }
    if (q.includes("JOIN fleets f") && q.includes("FOR UPDATE OF m, f")) {
      return rows(
        this.memberships
          .filter(
            (membership) =>
              membership.user_id === String(params[0]) &&
              membership.status === "active",
          )
          .map((membership) => {
            const fleet = this.fleets.find((candidate) => candidate.id === membership.fleet_id);
            return {
              id: membership.id,
              fleet_id: membership.fleet_id,
              role: membership.role,
              status: membership.status,
              fleet_status: fleet?.status ?? "missing",
              owner_user_id: fleet?.owner_user_id ?? null,
            };
          }),
      );
    }
    if (q.includes("WHERE owner_user_id = $1")) {
      return rows(this.fleets.filter((fleet) => fleet.owner_user_id === String(params[0])));
    }
    if (
      q.includes("FROM fleet_memberships") &&
      q.includes("WHERE fleet_id = $1") &&
      q.includes("role = 'fleet_owner'") &&
      q.includes("status = 'active'")
    ) {
      return rows(
        this.memberships
          .filter(
            (membership) =>
              membership.fleet_id === String(params[0]) &&
              membership.role === "fleet_owner" &&
              membership.status === "active",
          )
          .map((membership) => ({ user_id: membership.user_id })),
      );
    }
    if (
      q.includes("FROM fleet_memberships") &&
      q.includes("WHERE user_id = $1") &&
      !q.includes("JOIN fleets")
    ) {
      return rows(
        this.memberships.filter(
          (membership) => membership.user_id === String(params[0]),
        ),
      );
    }
    if (q.startsWith("INSERT INTO fleets")) {
      const fleet: FleetRecord = {
        id: this.fleets.length === 0 ? FLEET_ID : `fleet-${this.nextFleetId++}`,
        name: String(params[0]),
        status: "active",
        owner_user_id: String(params[1]),
        created_at: new Date().toISOString(),
      };
      this.fleets.push(fleet);
      return rows([{ id: fleet.id }]);
    }
    if (q.startsWith("INSERT INTO fleet_memberships")) {
      const fleetId = String(params[0]);
      const userId = String(params[1]);
      const existing = this.memberships.find(
        (membership) =>
          membership.fleet_id === fleetId && membership.user_id === userId,
      );
      if (existing) {
        existing.role = "fleet_owner";
        existing.status = "active";
        return rows([{ id: existing.id }]);
      }
      const membership: MembershipRecord = {
        id: MEMBERSHIP_ID,
        fleet_id: fleetId,
        user_id: userId,
        role: "fleet_owner",
        status: "active",
        created_at: new Date().toISOString(),
      };
      this.memberships.push(membership);
      return rows([{ id: membership.id }]);
    }
    if (q.includes("owner_count")) {
      const userId = String(params[0]);
      const fleetId = String(params[1]);
      const active = this.memberships.filter(
        (membership) =>
          membership.user_id === userId && membership.status === "active",
      );
      const ownerCount = active.filter((membership) => {
        const fleet = this.fleets.find(
          (candidate) => candidate.id === membership.fleet_id,
        );
        return (
          membership.fleet_id === fleetId &&
          membership.role === "fleet_owner" &&
          fleet?.status === "active" &&
          fleet.owner_user_id === userId
        );
      }).length;
      return rows([{ owner_count: ownerCount, active_count: active.length }]);
    }

    throw new Error(`Unexpected query in test: ${q}`);
  }
}

function rows<T extends object>(values: T[]): { rows: Row[]; rowCount: number } {
  return { rows: values as unknown as Row[], rowCount: values.length };
}

function run(
  client: FakeClient,
  overrides: Partial<BootstrapOwnerInput> = {},
): Promise<Awaited<ReturnType<typeof bootstrapOwner>>> {
  return bootstrapOwner(client as unknown as Client, {
    subject: SUBJECT,
    email: EMAIL,
    displayName: "Owner Name",
    fleetName: "Owner Fleet",
    ...overrides,
  });
}

function seedUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: USER_ID,
    idp_subject: SUBJECT,
    email: EMAIL,
    display_name: "Owner Name",
    status: "active",
    ...overrides,
  };
}

function seedFleet(overrides: Partial<FleetRecord> = {}): FleetRecord {
  return {
    id: FLEET_ID,
    name: "Owner Fleet",
    status: "active",
    owner_user_id: USER_ID,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function seedMembership(overrides: Partial<MembershipRecord> = {}): MembershipRecord {
  return {
    id: MEMBERSHIP_ID,
    fleet_id: FLEET_ID,
    user_id: USER_ID,
    role: "fleet_owner",
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("bootstrapOwner", () => {
  it("creates the user, active fleet, and one active owner membership in one transaction", async () => {
    const client = new FakeClient();

    const result = await run(client);

    expect(result).toEqual({
      outcome: "created",
      fleetCreated: true,
      membershipCreated: true,
    });
    expect(client.counts).toEqual({ begin: 1, commit: 1, rollback: 0 });
    expect(client.users).toHaveLength(1);
    expect(client.fleets).toHaveLength(1);
    expect(client.memberships).toHaveLength(1);
    expect(client.fleets[0]).toMatchObject({
      status: "active",
      owner_user_id: client.users[0]?.id,
    });
    expect(client.memberships[0]).toMatchObject({
      role: "fleet_owner",
      status: "active",
      user_id: client.users[0]?.id,
      fleet_id: client.fleets[0]?.id,
    });
    expect(client.queries[0]?.sql).toBe("BEGIN");
    expect(client.queries.at(-1)?.sql).toBe("COMMIT");
    expect(
      client.queries.some((query) =>
        query.sql.includes("pg_advisory_xact_lock"),
      ),
    ).toBe(true);
  });

  it("is idempotent when the owner is already provisioned", async () => {
    const client = new FakeClient({
      users: [seedUser()],
      fleets: [seedFleet()],
      memberships: [seedMembership()],
    });

    const first = await run(client);
    const second = await run(client);

    expect(first.outcome).toBe("already_bootstrapped");
    expect(second.outcome).toBe("already_bootstrapped");
    expect(client.users).toHaveLength(1);
    expect(client.fleets).toHaveLength(1);
    expect(client.memberships).toHaveLength(1);
    expect(client.counts).toEqual({ begin: 2, commit: 2, rollback: 0 });
  });

  it("reuses an owned active fleet and activates a prior invited membership", async () => {
    const client = new FakeClient({
      users: [seedUser()],
      fleets: [seedFleet()],
      memberships: [seedMembership({ role: "fleet_admin", status: "invited" })],
    });

    const result = await run(client);

    expect(result).toEqual({
      outcome: "repaired",
      fleetCreated: false,
      membershipCreated: true,
    });
    expect(client.fleets).toHaveLength(1);
    expect(client.memberships).toHaveLength(1);
    expect(client.memberships[0]).toMatchObject({
      role: "fleet_owner",
      status: "active",
    });
    expect(client.counts).toEqual({ begin: 1, commit: 1, rollback: 0 });
  });

  it("refuses to promote an existing active non-owner membership", async () => {
    const client = new FakeClient({
      users: [seedUser()],
      fleets: [seedFleet({ owner_user_id: OTHER_USER_ID })],
      memberships: [seedMembership({ role: "fleet_member", status: "active" })],
    });

    await expect(run(client)).rejects.toMatchObject({
      stage: "inspect_membership",
    });
    expect(client.counts.rollback).toBe(1);
    expect(client.counts.commit).toBe(0);
    expect(client.memberships[0]).toMatchObject({
      role: "fleet_member",
      status: "active",
    });
  });

  it("refuses an email address linked to another identity", async () => {
    const client = new FakeClient({
      users: [
        seedUser({
          id: OTHER_USER_ID,
          idp_subject: "other-idp-subject",
        }),
      ],
    });

    await expect(run(client)).rejects.toMatchObject({
      stage: "validate_identity",
    });
    expect(client.counts.rollback).toBe(1);
    expect(client.users).toHaveLength(1);
  });

  it("refuses multiple fleets owned by the same identity", async () => {
    const client = new FakeClient({
      users: [seedUser()],
      fleets: [
        seedFleet(),
        seedFleet({
          id: OTHER_FLEET_ID,
          name: "Second Fleet",
          created_at: "2026-01-02T00:00:00.000Z",
        }),
      ],
    });

    await expect(run(client)).rejects.toMatchObject({
      stage: "inspect_owned_fleets",
    });
    expect(client.counts.rollback).toBe(1);
    expect(client.fleets).toHaveLength(2);
  });

  it("refuses prior membership history in another fleet", async () => {
    const client = new FakeClient({
      users: [seedUser()],
      fleets: [seedFleet()],
      memberships: [
        seedMembership({
          fleet_id: OTHER_FLEET_ID,
          role: "fleet_member",
          status: "removed",
        }),
      ],
    });

    await expect(run(client)).rejects.toMatchObject({
      stage: "inspect_prior_memberships",
    });
    expect(client.counts.rollback).toBe(1);
    expect(client.memberships).toHaveLength(1);
  });

  it("refuses to silently reactivate a suspended membership", async () => {
    const client = new FakeClient({
      users: [seedUser()],
      fleets: [seedFleet()],
      memberships: [seedMembership({ status: "suspended" })],
    });

    await expect(run(client)).rejects.toMatchObject({
      stage: "inspect_prior_memberships",
    });
    expect(client.counts.rollback).toBe(1);
    expect(client.memberships[0]).toMatchObject({ status: "suspended" });
  });

  it("rolls back and reports only a redacted stage, code, and message on a database error", async () => {
    const client = new FakeClient();
    const raw = Object.assign(
      new Error(
        `duplicate key value violates unique constraint "users_idp_subject_key" postgresql://owner:secret@db.example.test/fleet ${EMAIL} ${USER_ID} Bearer abcdefghijklmnop`,
      ),
      { code: "23505" },
    );
    client.failOn = { fragment: "INSERT INTO fleets", error: raw };

    let failure: unknown;
    try {
      await run(client);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(BootstrapFailure);
    expect((failure as BootstrapFailure).stage).toBe("create_fleet");
    const formatted = formatSafeError(failure);
    expect(formatted).toContain("stage=create_fleet code=23505");
    expect(formatted).toContain("[database URL redacted]");
    expect(formatted).toContain("[email redacted]");
    expect(formatted).toContain("[uuid redacted]");
    expect(formatted).toContain("[token redacted]");
    expect(formatted).not.toContain("secret");
    expect(formatted).not.toContain(EMAIL);
    expect(formatted).not.toContain(USER_ID);
    expect(client.counts.rollback).toBe(1);
    expect(client.counts.commit).toBe(0);
    expect(client.users).toHaveLength(0);
    expect(client.fleets).toHaveLength(0);
    expect(client.memberships).toHaveLength(0);
  });
});

describe("bootstrap error reporting", () => {
  it("describes a WebSocket event without repeating the empty event type", () => {
    const formatted = formatSafeError(
      toBootstrapFailure("connect", { type: "error", message: "" }),
    );

    expect(formatted).toBe(
      "stage=connect message=The WebSocket connection ended before Neon returned an error message.",
    );
  });

  it("keeps the error code from a connection failure", () => {
    const formatted = formatSafeError(
      toBootstrapFailure(
        "connect",
        Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {
          code: "ECONNREFUSED",
        }),
      ),
    );

    expect(formatted).toBe(
      "stage=connect code=ECONNREFUSED message=connect ECONNREFUSED 127.0.0.1:443",
    );
  });

  it("redacts connection strings, emails, UUIDs, and bearer tokens", () => {
    const redacted = redactSensitive(
      `postgresql://owner:secret@db.example.test/fleet ${EMAIL} ${USER_ID} Bearer abcdefghijklmnop`,
    );

    expect(redacted).toContain("[database URL redacted]");
    expect(redacted).toContain("[email redacted]");
    expect(redacted).toContain("[uuid redacted]");
    expect(redacted).toContain("[token redacted]");
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain(EMAIL);
    expect(redacted).not.toContain(USER_ID);
  });
});
