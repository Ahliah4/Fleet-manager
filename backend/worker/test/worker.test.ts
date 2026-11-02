import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const database = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), end: vi.fn() }));

vi.mock("@neondatabase/serverless", () => ({
  Pool: class MockPool {
    query(sql: string, values?: unknown[]) { return database.query(sql, values); }
    async connect() {
      await database.connect();
      return { query: this.query.bind(this), release: () => undefined };
    }
    end() { return database.end(); }
  },
}));

import app from "../src/index.js";

const issuer = "https://auth.dev.example";
const audience = issuer;
const jwksUrl = `${issuer}/.well-known/jwks.json`;
const ownerId = "10000000-0000-4000-8000-000000000001";
const fleetId = "20000000-0000-4000-8000-000000000002";
let privateKey: CryptoKey;
let publicJwk: Record<string, unknown>;

beforeAll(async () => {
  const pair = await generateKeyPair("EdDSA");
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: "dev-test-key", alg: "EdDSA", use: "sig" };
});

beforeEach(() => {
  database.connect.mockResolvedValue(undefined);
  database.end.mockResolvedValue(undefined);
  database.query.mockImplementation(async (sql: string, values: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.startsWith("SELECT current_user = $1 AS expected_role")) {
      return { rows: [{ expected_role: true, role_safe: true, schema_ready: true }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT id, display_name, status FROM users")) {
      return { rows: [{ id: ownerId, display_name: "Fleet Owner", status: "active" }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT id, fleet_id, role, status FROM fleet_memberships")) {
      return { rows: [{ id: "membership-1", fleet_id: fleetId, role: "fleet_owner", status: "active" }], rowCount: 1 };
    }
    if (normalized.includes("app_security.is_platform_admin")) {
      return { rows: [{ is_admin: false }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT id, name, status, policy FROM fleets")) {
      return { rows: [{ id: fleetId, name: "Development Fleet", status: "active", policy: {} }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT count(*)::text AS total FROM vehicles")) {
      return { rows: [{ total: "1" }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT id, registration_number AS \"registrationNumber\"")) {
      return { rows: [{ id: "vehicle-1", registrationNumber: "IPM001", make: "Toyota", model: "Vitz", year: 2020 }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT count(*)::text AS total FROM drivers")) {
      return { rows: [{ total: "1" }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT id, full_name AS \"fullName\"")) {
      return {
        rows: [{ id: "driver-1", fullName: "Test Driver", phone: null, licenceNumber: null, licenceExpiry: null, status: "active", notes: null, createdAt: new Date(), updatedAt: new Date() }],
        rowCount: 1,
      };
    }
    if (normalized.startsWith("SELECT count(*)::text AS total FROM hires")) {
      return { rows: [{ total: "1" }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT h.id, h.vehicle_id AS \"vehicleId\"")) {
      return {
        rows: [{ id: "hire-1", vehicleId: "vehicle-1", vehicleRegistration: "IPM001", driverId: "driver-1", driverName: "Test Driver", status: "active", startsAt: new Date(), expectedEndAt: null, actualEndAt: null, notes: null, createdAt: new Date(), updatedAt: new Date() }],
        rowCount: 1,
      };
    }
    if (normalized.startsWith("INSERT INTO audit_events")) {
      return { rows: [], rowCount: 1 };
    }
    if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("SELECT set_config")) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected test query: ${normalized} ${JSON.stringify(values)}`);
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }, {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
  }))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function token(options: { expiresAt?: number } = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", kid: "dev-test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("neon-subject-owner")
    .setIssuedAt(now)
    .setExpirationTime(options.expiresAt ?? now + 300)
    .sign(privateKey);
}

const authEnv = {
  AUTH_ISSUER: issuer,
  AUTH_AUDIENCE: audience,
  AUTH_JWKS_URL: jwksUrl,
  DATABASE_URL: "postgresql://test:test@example.neon.tech/neondb?sslmode=require",
};

describe("Fleet API Worker auth and tenant boundary", () => {
  it("reports database, schema, role, and auth readiness separately", async () => {
    const response = await app.request("/readyz", {}, authEnv);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      checks: {
        database: "ok",
        schema: "ok",
        databaseRole: "ok",
        auth: "configured",
      },
    });
  });

  it("logs only a safe category when the database rejects the connection", async () => {
    database.connect.mockRejectedValue(
      Object.assign(new Error("password authentication failed for user app_rw at private-host"), {
        code: "28P01",
      }),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await app.request("/readyz", {}, authEnv);
    expect(response.status).toBe(503);
    const logged = JSON.parse(String(errorLog.mock.calls[0]?.[0]));
    expect(logged).toMatchObject({
      code: "DATABASE_READINESS_FAILED",
      stage: "connect",
      databaseErrorCode: "28P01",
      databaseFailureCategory: "LOGIN_REJECTED",
    });
    expect(JSON.stringify(logged)).not.toContain("password authentication");
    expect(JSON.stringify(logged)).not.toContain("private-host");
  });

  it("fails closed when auth is not configured", async () => {
    const response = await app.request("/v1/me", {}, {});
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("AUTH_NOT_CONFIGURED");
  });

  it("rejects an expired signed session", async () => {
    const expired = await token({ expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const response = await app.request("/v1/me", {
      headers: { authorization: `Bearer ${expired}` },
    }, authEnv);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTH_INVALID");
    expect(database.connect).not.toHaveBeenCalled();
  });

  it("rejects a malformed bearer token", async () => {
    const response = await app.request("/v1/me", {
      headers: { authorization: "Bearer invalid-token" },
    }, authEnv);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTH_INVALID");
    expect(database.connect).not.toHaveBeenCalled();
  });

  it("resolves a verified Neon subject to its active application membership", async () => {
    const response = await app.request("/v1/me", {
      headers: { authorization: `Bearer ${await token()}` },
    }, authEnv);
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.user.id).toBe(ownerId);
    expect(body.membership.fleet.id).toBe(fleetId);
    expect(body.membership.role).toBe("fleet_owner");
    expect(body.platformAdmin).toBe(false);
  });

  it("denies a valid Neon identity with no provisioned application user", async () => {
    database.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.startsWith("SELECT set_config")) return { rows: [], rowCount: 1 };
      if (normalized.startsWith("SELECT id, display_name, status FROM users")) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error("Unexpected test query");
    });

    const response = await app.request("/v1/me", {
      headers: { authorization: `Bearer ${await token()}` },
    }, authEnv);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("ACCOUNT_NOT_PROVISIONED");
  });

  it("uses the authenticated fleet in RLS context and vehicle queries", async () => {
    const response = await app.request("/v1/vehicles?limit=10&offset=0", {
      headers: { authorization: `Bearer ${await token()}` },
    }, authEnv);
    expect(response.status).toBe(200);
    const vehicleQuery = database.query.mock.calls.find(([sql]) => String(sql).includes("FROM vehicles") && String(sql).includes("LIMIT $3"));
    expect(vehicleQuery?.[1]?.[0]).toBe(fleetId);
    const rlsContext = database.query.mock.calls.find(([sql]) => String(sql).includes("set_config('app.user_id'") && String(sql).includes("app.fleet_id"));
    expect(rlsContext?.[1]).toEqual([ownerId, fleetId, "fleet_owner", expect.any(String)]);
  });

  it("serves drivers with the authenticated fleet and permission boundary", async () => {
    const response = await app.request("/v1/drivers?limit=10&offset=0", {
      headers: { authorization: `Bearer ${await token()}` },
    }, authEnv);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.drivers[0].id).toBe("driver-1");
    const driverQuery = database.query.mock.calls.find(([sql]) => String(sql).includes("FROM drivers") && String(sql).includes("LIMIT $4"));
    expect(driverQuery?.[1]?.[0]).toBe(fleetId);
  });

  it("serves hires with the authenticated fleet and operation permission", async () => {
    const response = await app.request("/v1/hires?limit=10&offset=0", {
      headers: { authorization: `Bearer ${await token()}` },
    }, authEnv);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.hires[0].id).toBe("hire-1");
    const hireQuery = database.query.mock.calls.find(([sql]) => String(sql).includes("FROM hires h") && String(sql).includes("LIMIT $5"));
    expect(hireQuery?.[1]?.[0]).toBe(fleetId);
  });
});
