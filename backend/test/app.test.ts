import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type { TokenVerifier } from "../src/auth/jwtVerifier.js";
import type { Session } from "../src/domain/session.js";
import {
  FakeDatabase,
  FLEET_ID,
  VEHICLE_ID,
  makeConfig,
  makePlatformSession,
  makeSession,
  makeVehicle,
  type QueryHandler,
} from "./helpers.js";

const apps: FastifyInstance[] = [];

const goodVerifier: TokenVerifier = {
  async verify(token: string) {
    if (token === "good-token") {
      return { subject: "idp-subject-test" };
    }
    throw new Error("invalid token");
  },
};

const authConfig: AppConfig["auth"] = {
  issuer: "https://id.example.test/",
  audience: "fleet-api",
  jwksUrl: "https://id.example.test/.well-known/jwks.json",
  clockToleranceSeconds: 30,
};

async function createApp(options: {
  session?: Session;
  config?: Partial<AppConfig>;
  withVerifier?: boolean;
  queryHandler?: QueryHandler;
} = {}): Promise<{ app: FastifyInstance; database: FakeDatabase }> {
  const database = new FakeDatabase();
  database.session = options.session ?? makeSession("fleet_member");
  if (options.queryHandler) {
    database.queryHandler = options.queryHandler;
  }
  const app = await buildApp({
    config: makeConfig(options.config),
    database,
    verifier: options.withVerifier === false ? null : goodVerifier,
  });
  apps.push(app);
  return { app, database };
}

function authHeaders(token = "good-token") {
  return {
    authorization: `Bearer ${token}`,
    "x-request-id": "test-request-123",
  };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("health and readiness", () => {
  it("reports liveness without a database dependency", async () => {
    const { app } = await createApp({ withVerifier: false });
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", service: "fleet-api" });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("fails readiness closed when auth is not configured", async () => {
    const { app } = await createApp({ withVerifier: false });
    const response = await app.inject({ method: "GET", url: "/readyz" });
    expect(response.statusCode).toBe(503);
    expect(response.json().checks).toEqual({
      database: "ok",
      schema: "ok",
      auth: "not_configured",
    });
  });

  it("reports ready when the database, schema, and auth are configured", async () => {
    const { app } = await createApp({ config: { auth: authConfig } });
    const response = await app.inject({ method: "GET", url: "/readyz" });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");
  });

  it("fails readiness when the schema is missing", async () => {
    const { app, database } = await createApp({ config: { auth: authConfig } });
    database.schemaReadyResult = false;
    const response = await app.inject({ method: "GET", url: "/readyz" });
    expect(response.statusCode).toBe(503);
    expect(response.json().checks.database).toBe("unavailable");
    expect(response.json().checks.schema).toBe("unavailable");
    expect(response.json().checks.auth).toBe("configured");
  });
});

describe("authentication boundary", () => {
  it("returns 503 instead of accepting requests when auth is absent", async () => {
    const { app } = await createApp({ withVerifier: false });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("AUTH_NOT_CONFIGURED");
  });

  it("requires a bearer token", async () => {
    const { app } = await createApp();
    const response = await app.inject({ method: "GET", url: "/v1/me" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTH_REQUIRED");
    expect(response.headers["www-authenticate"]).toBe("Bearer");
  });

  it("rejects an invalid token without leaking details", async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: authHeaders("bad-token"),
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTH_INVALID");
    expect(JSON.stringify(response.json())).not.toContain("invalid token");
  });

  it("returns the server-resolved session for a valid token", async () => {
    const { app, database } = await createApp({
      session: makeSession("fleet_owner"),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(database.fleetCalls).toBe(0);
    const body = response.json();
    expect(body.user.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(body.membership.fleet.id).toBe(FLEET_ID);
    expect(body.membership.role).toBe("fleet_owner");
    expect(body.recovery).toBeNull();
  });

  it("returns a recovery path for a signed-in user without a fleet", async () => {
    const { app } = await createApp({
      session: {
        user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", displayName: "No Fleet" },
        membership: null,
        platformAdmin: false,
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().membership).toBeNull();
    expect(response.json().recovery.nextStep).toMatch(/invite/i);
  });

  it("rejects a valid Neon identity that has no application user mapping", async () => {
    const { app, database } = await createApp();
    database.session = null;
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("ACCOUNT_NOT_PROVISIONED");
    expect(database.fleetCalls).toBe(0);
  });

  it("does not show fleet recovery to a platform administrator", async () => {
    const { app } = await createApp({ session: makePlatformSession() });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().platformAdmin).toBe(true);
    expect(response.json().recovery).toBeNull();
  });

  it("echoes a valid request ID and uses it as the support reference", async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBe("test-request-123");

    const rejected = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: authHeaders("bad-token"),
    });
    expect(rejected.statusCode).toBe(401);
    expect(rejected.json().error.supportReference).toBe("test-request-123");
  });
});

describe("tenant and role enforcement", () => {
  it("does not let a fleet member read or create membership invitations", async () => {
    const { app, database } = await createApp({
      session: makeSession("fleet_member"),
    });
    const list = await app.inject({
      method: "GET",
      url: "/v1/members/invitations",
      headers: authHeaders(),
    });
    const create = await app.inject({
      method: "POST",
      url: "/v1/members/invitations",
      headers: authHeaders(),
      payload: { email: "driver@example.test", role: "fleet_member" },
    });
    expect(list.statusCode).toBe(403);
    expect(create.statusCode).toBe(403);
    expect(database.fleetCalls).toBe(0);
  });

  it("does not let an administrator invite another administrator", async () => {
    const { app, database } = await createApp({
      session: makeSession("fleet_admin"),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/members/invitations",
      headers: authHeaders(),
      payload: { email: "admin@example.test", role: "fleet_admin" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("PERMISSION_DENIED");
    expect(database.fleetCalls).toBe(0);
  });

  it("creates a member invitation from the server-resolved fleet and audits it", async () => {
    const queries: string[] = [];
    const invitationId = "f0000001-0000-4000-8000-000000000001";
    const { app } = await createApp({
      session: makeSession("fleet_owner"),
      queryHandler: async (sql, params) => {
        queries.push(sql);
        if (sql.includes("INSERT INTO fleet_invitations")) {
          expect(params?.[0]).toBe(FLEET_ID);
          expect(params?.[1]).toBe("driver@example.test");
          expect(params?.[2]).toBe("fleet_member");
          return {
            rows: [{
              id: invitationId,
              invitedEmail: "driver@example.test",
              role: "fleet_member",
              status: "pending",
              invitedAt: new Date(),
              expiresAt: new Date(),
              acceptedAt: null,
              revokedAt: null,
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/members/invitations",
      headers: authHeaders(),
      payload: { email: "DRIVER@EXAMPLE.TEST", role: "fleet_member" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().invitation.id).toBe(invitationId);
    expect(queries.some((sql) => sql.includes("INSERT INTO audit_events"))).toBe(true);
  });

  it("scopes invitation revocation to the authenticated fleet", async () => {
    const queries: string[] = [];
    const { app } = await createApp({
      session: makeSession("fleet_owner"),
      queryHandler: async (sql, params) => {
        queries.push(sql);
        if (sql.includes("UPDATE fleet_invitations")) {
          expect(params?.[1]).toBe(FLEET_ID);
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    });
    const response = await app.inject({
      method: "DELETE",
      url: "/v1/members/invitations/f0000001-0000-4000-8000-000000000001",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(404);
    expect(queries.some((sql) => sql.includes("UPDATE fleet_invitations"))).toBe(true);
  });

  it("accepts an invitation only through the user-scoped database function", async () => {
    const invitationId = "f0000001-0000-4000-8000-000000000001";
    const { app, database } = await createApp({
      session: {
        user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", displayName: "Invited User" },
        membership: null,
        platformAdmin: false,
      },
      queryHandler: async (sql, params) => {
        expect(sql).toContain("app_security.accept_fleet_invitation");
        expect(params).toEqual([invitationId]);
        return {
          rows: [{
            membershipId: "b0000001-0000-4000-8000-000000000001",
            fleetId: FLEET_ID,
            role: "fleet_member",
          }],
          rowCount: 1,
        };
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/members/invitations/${invitationId}/accept`,
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().invitation.fleetId).toBe(FLEET_ID);
    expect(database.userCalls).toBe(1);
    expect(database.fleetCalls).toBe(0);
  });

  it("does not reveal whether an invitation belongs to another account", async () => {
    const { app, database } = await createApp({
      session: {
        user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", displayName: "Invited User" },
        membership: null,
        platformAdmin: false,
      },
      queryHandler: async () => ({ rows: [], rowCount: 0 }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/members/invitations/f0000001-0000-4000-8000-000000000001/accept",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.message).not.toMatch(/email|fleet/i);
    expect(database.userCalls).toBe(1);
  });

  it("rejects client-supplied fleetId or role before touching the database", async () => {
    const { app, database } = await createApp({
      session: makeSession("fleet_member"),
    });
    for (const extra of [{ fleetId: "22222222-2222-4222-8222-222222222222" }, { role: "fleet_owner" }]) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/vehicles",
        headers: authHeaders(),
        payload: {
          registrationNumber: "AAA 111",
          make: "Toyota",
          model: "Corolla",
          year: 2020,
          ...extra,
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_FAILED");
      expect(response.json().error.fieldErrors).toBeDefined();
    }
    expect(database.fleetCalls).toBe(0);
  });

  it("does not let a Fleet Member delete a vehicle", async () => {
    const { app, database } = await createApp({
      session: makeSession("fleet_member"),
    });
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/vehicles/${VEHICLE_ID}`,
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("PERMISSION_DENIED");
    expect(database.fleetCalls).toBe(0);
  });

  it("does not let Finance Manager create vehicles", async () => {
    const { app, database } = await createApp({
      session: makeSession("finance_manager"),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/vehicles",
      headers: authHeaders(),
      payload: {
        registrationNumber: "AAA 111",
        make: "Toyota",
        model: "Corolla",
        year: 2020,
      },
    });
    expect(response.statusCode).toBe(403);
    expect(database.fleetCalls).toBe(0);
  });

  it("honors the member_can_write fleet policy", async () => {
    const { app, database } = await createApp({
      session: makeSession("fleet_member", { policy: { memberCanWrite: false } }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/vehicles",
      headers: authHeaders(),
      payload: {
        registrationNumber: "AAA 111",
        make: "Toyota",
        model: "Corolla",
        year: 2020,
      },
    });
    expect(response.statusCode).toBe(403);
    expect(database.fleetCalls).toBe(0);
  });

  it("creates a vehicle with the fleet from the session, then audits it", async () => {
    const queries: string[] = [];
    const { app, database } = await createApp({
      session: makeSession("fleet_member"),
      queryHandler: async (sql) => {
        queries.push(sql);
        if (sql.includes("INSERT INTO vehicles")) {
          return { rows: [makeVehicle()], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO audit_events")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/vehicles",
      headers: authHeaders(),
      payload: {
        registrationNumber: "AAA 111",
        make: "Toyota",
        model: "Corolla",
        year: 2020,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().vehicle.registrationNumber).toBe("AAA 111");
    expect(database.fleetCalls).toBe(1);
    expect(queries.some((sql) => sql.includes("INSERT INTO audit_events"))).toBe(true);
  });

  it("returns only minimal vehicle fields to Finance Manager", async () => {
    const { app } = await createApp({
      session: makeSession("finance_manager"),
      queryHandler: async (sql) => {
        if (sql.includes("count(*)")) {
          return { rows: [{ total: "1" }], rowCount: 1 };
        }
        if (sql.includes("FROM vehicles")) {
          return { rows: [makeVehicle()], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/vehicles",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    const vehicle = response.json().vehicles[0];
    expect(vehicle.registrationNumber).toBe("AAA 111");
    expect(vehicle.notes).toBeUndefined();
    expect(vehicle.insuranceExpiry).toBeUndefined();
  });

  it("does not let a platform admin use fleet routes without a membership", async () => {
    const { app } = await createApp({ session: makePlatformSession() });
    const response = await app.inject({
      method: "GET",
      url: "/v1/vehicles",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("NO_ACTIVE_FLEET");
  });

  it("allows a platform admin to read the fleet directory", async () => {
    const { app, database } = await createApp({
      session: makePlatformSession(),
      queryHandler: async (sql) => {
        if (sql.includes("count(*)")) {
          return { rows: [{ total: "1" }], rowCount: 1 };
        }
        if (sql.includes("FROM fleets")) {
          return {
            rows: [
              {
                id: FLEET_ID,
                name: "Test Fleet",
                status: "active",
                timezone: "UTC",
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/platform/fleets",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().fleets).toHaveLength(1);
    expect(response.json().pagination.total).toBe(1);
    expect(database.platformCalls).toBe(1);
  });
});

describe("error envelope", () => {
  it("returns a human-readable 404 without exposing internals", async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/does-not-exist",
      headers: { "x-request-id": "test-request-123" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("ROUTE_NOT_FOUND");
    expect(response.json().error.supportReference).toBe("test-request-123");
  });

  it("does not leak internal error text", async () => {
    const { app, database } = await createApp({
      session: makeSession("fleet_owner"),
    });
    database.withFleetError = new Error("secret database host and password");
    const response = await app.inject({
      method: "GET",
      url: "/v1/vehicles",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(response.json())).not.toContain("secret");
  });
});
