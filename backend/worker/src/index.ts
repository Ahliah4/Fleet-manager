import { Hono } from "hono";
import type { Context, Next } from "hono";
import { Client } from "pg";
import { createTokenVerifier, type TokenVerifier } from "../../src/auth/jwtVerifier.js";
import { isFleetRole, normalizeFleetPolicy, permissionsForRole } from "../../src/domain/permissions.js";
import type { FleetSession, Session } from "../../src/domain/session.js";
import type { VehicleRecord } from "../../src/repositories/vehicles.js";
import { escapeLike } from "../../src/domain/validation.js";
import {
  driverBodySchema,
  driverIdParamsSchema,
  driverQuerySchema,
  driverUpdateSchema,
  expenseBodySchema,
  financeIdParamsSchema,
  financeQuerySchema,
  hireBodySchema,
  hireIdParamsSchema,
  hireQuerySchema,
  hireUpdateSchema,
  incomeBodySchema,
  membershipInvitationBodySchema,
  membershipInvitationParamsSchema,
  remittanceBodySchema,
  vehicleBodySchema,
  vehicleIdParamsSchema,
  vehicleUpdateSchema,
  vehicleQuerySchema,
  voidBodySchema,
} from "../../src/routes/schemas.js";

interface Env {
  HYPERDRIVE?: Hyperdrive;
  AUTH_ISSUER?: string;
  AUTH_AUDIENCE?: string;
  AUTH_JWKS_URL?: string;
  AUTH_CLOCK_TOLERANCE_SECONDS?: string;
  DATABASE_EXPECTED_ROLE?: string;
  CORS_ORIGIN?: string;
}

interface Hyperdrive {
  connectionString: string;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    supportReference: string;
    retryable: boolean;
  };
}

interface WorkerDriver {
  id: string;
  fullName: string;
  phone: string | null;
  licenceNumber: string | null;
  licenceExpiry: string | null;
  status: "active" | "inactive";
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkerHire {
  id: string;
  vehicleId: string;
  vehicleRegistration: string | null;
  driverId: string;
  driverName: string | null;
  status: "planned" | "active" | "completed" | "cancelled";
  startsAt: Date;
  expectedEndAt: Date | null;
  actualEndAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkerExpense {
  id: string;
  entryDate: string;
  vehicleId: string;
  vehicleRegistration: string | null;
  vehicleName: string | null;
  category: string;
  description: string;
  amount: string;
  currency: string;
  supplier: string | null;
  paymentMethod: string | null;
  notes: string | null;
  status: "posted" | "voided";
  voidReason: string | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkerIncome {
  id: string;
  entryDate: string;
  description: string;
  amount: string;
  currency: string;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  vehicleName: string | null;
  driverId: string | null;
  driverName: string | null;
  paymentMethod: string | null;
  reference: string | null;
  notes: string | null;
  status: "posted" | "voided";
  voidReason: string | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkerRemittance {
  id: string;
  entryDate: string;
  driverId: string;
  driverName: string | null;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  vehicleName: string | null;
  periodStart: string;
  periodEnd: string;
  amount: string;
  currency: string;
  paymentMethod: string | null;
  reference: string | null;
  notes: string | null;
  status: "posted" | "voided";
  voidReason: string | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkerInvitation {
  id: string;
  invitedEmail: string;
  role: "fleet_admin" | "fleet_manager" | "finance_manager" | "fleet_member" | "read_only";
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

const app = new Hono<{ Bindings: Env; Variables: { requestId: string; session: Session } }>();
const verifierCache = new Map<string, TokenVerifier>();

app.use("*", async (context, next) => {
  const requestId = safeRequestId(context.req.header("x-request-id")) ?? crypto.randomUUID();
  context.set("requestId", requestId);
  await next();
  context.header("x-request-id", requestId);
  context.header("cache-control", "no-store");
  context.header("x-content-type-options", "nosniff");
  context.header("referrer-policy", "no-referrer");

  const origin = context.req.header("origin");
  if (origin && context.env.CORS_ORIGIN && origin === context.env.CORS_ORIGIN) {
    context.header("access-control-allow-origin", origin);
    context.header("vary", "Origin");
    context.header("access-control-allow-headers", "authorization,content-type,x-request-id");
    context.header("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  }
});

app.options("*", (context) => context.body(null, 204));

app.get("/healthz", (context) =>
  context.json({ status: "ok", service: "fleet-api" }),
);

app.get("/readyz", async (context) => {
  const authConfigured = Boolean(
    context.env.AUTH_ISSUER && context.env.AUTH_AUDIENCE && context.env.AUTH_JWKS_URL,
  );
  let databaseConnected = false;
  let schemaReady = false;
  let databaseRoleSafe = false;
  if (context.env.HYPERDRIVE?.connectionString) {
    const client = new Client({ connectionString: context.env.HYPERDRIVE.connectionString });
    let failureStage: "connect" | "readiness_query" = "connect";
    try {
      await client.connect();
      databaseConnected = true;
      failureStage = "readiness_query";
      const result = await client.query<{
        expected_role: boolean;
        role_safe: boolean;
        schema_ready: boolean;
      }>(
        `SELECT current_user = $1 AS expected_role,
          NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb
            AND NOT r.rolcreaterole AND NOT r.rolinherit AS role_safe,
          to_regclass('public.schema_migrations') IS NOT NULL
            AND to_regclass('public.fleets') IS NOT NULL
            AND to_regclass('public.vehicles') IS NOT NULL
            AND to_regclass('public.audit_events') IS NOT NULL AS schema_ready
         FROM pg_roles r WHERE r.rolname = current_user`,
        [context.env.DATABASE_EXPECTED_ROLE ?? "app_rw"],
      );
      const readiness = result.rows[0];
      databaseRoleSafe = readiness?.expected_role === true && readiness.role_safe === true;
      schemaReady = readiness?.schema_ready === true;
    } catch (error) {
      const databaseErrorCode =
        typeof error === "object" && error !== null && "code" in error &&
        typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
          ? error.code
          : undefined;
      console.error(JSON.stringify({
        requestId: context.get("requestId"),
        code: "DATABASE_READINESS_FAILED",
        stage: failureStage,
        databaseErrorCode,
        databaseFailureCategory: safeDatabaseFailureCategory(error),
        errorType: error instanceof Error ? error.name : "UnknownError",
      }));
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  const ready = authConfigured && databaseConnected && schemaReady && databaseRoleSafe;
  return context.json(
    {
      status: ready ? "ok" : "unavailable",
      service: "fleet-api",
      checks: {
        database: databaseConnected ? "ok" : "unavailable",
        schema: schemaReady ? "ok" : "unavailable",
        databaseRole: databaseRoleSafe ? "ok" : "unavailable",
        auth: authConfigured ? "configured" : "not_configured",
      },
    },
    ready ? 200 : 503,
  );
});

function safeDatabaseFailureCategory(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/password|authentication failed|sasl|role .* does not exist/.test(message)) return "LOGIN_REJECTED";
  if (/enotfound|eai_again|could not translate host|name or service not known/.test(message)) return "HOST_LOOKUP_FAILED";
  if (/etimedout|timeout expired|timed out/.test(message)) return "CONNECTION_TIMEOUT";
  if (/econnrefused|connection refused/.test(message)) return "CONNECTION_REFUSED";
  if (/ssl|tls|certificate/.test(message)) return "TLS_ERROR";
  if (/endpoint.*(disabled|suspend)|compute.*(disabled|suspend)/.test(message)) return "DATABASE_COMPUTE_UNAVAILABLE";
  return "OTHER_DATABASE_ERROR";
}

app.get("/v1/me", authenticate, (context) => {
  const session = context.get("session");
  const membership = session.membership;
  return context.json({
    user: session.user,
    platformAdmin: session.platformAdmin,
    membership: membership
      ? {
          ...membership,
          fleet: { ...membership.fleet },
        }
      : null,
    recovery:
      membership || session.platformAdmin
        ? null
        : {
            message: "You are signed in, but you are not a member of a fleet.",
            nextStep: "Ask your fleet owner or administrator to invite you, then sign in again.",
          },
  });
});

app.get("/v1/vehicles", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.some((permission) => ["fleet.vehicles.read", "finance.context.read"].includes(permission))) {
    return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to view vehicles.");
  }

  const fleetSession: FleetSession = { ...session, membership };
  return withFleetContext(context.env, fleetSession, async (client) => {
    const queryParams = Object.fromEntries(new URL(context.req.url).searchParams.entries());
    const parsed = vehicleQuerySchema.safeParse(queryParams);
    if (!parsed.success) {
      return fail(context, 400, "INVALID_REQUEST", "Check the vehicle search and page values, then try again.");
    }
    const search = parsed.data.search ? `%${escapeLike(parsed.data.search.toLowerCase())}%` : null;
    const filter = `fleet_id = $1 AND deleted_at IS NULL AND (
      $2::text IS NULL OR registration_normalized LIKE $2 ESCAPE '\\'
      OR lower(make) LIKE $2 ESCAPE '\\' OR lower(model) LIKE $2 ESCAPE '\\'
    )`;
    const values = [membership.fleet.id, search];
    const count = await client.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM vehicles WHERE ${filter}`,
      values,
    );
    const items = await client.query<VehicleRecord>(
      `SELECT id, registration_number AS "registrationNumber", make, model, year,
              colour, notes, insurance_expiry AS "insuranceExpiry",
              road_tax_expiry AS "roadTaxExpiry", roadworthy_expiry AS "roadworthyExpiry",
              next_service_date AS "nextServiceDate", created_at AS "createdAt",
              updated_at AS "updatedAt"
       FROM vehicles WHERE ${filter}
       ORDER BY registration_number ASC, id ASC LIMIT $3 OFFSET $4`,
      [...values, parsed.data.limit, parsed.data.offset],
    );
    const fullRead = membership.permissions.includes("fleet.vehicles.read");
    return context.json({
      vehicles: items.rows.map((vehicle) => projectVehicle(vehicle, fullRead)),
      pagination: {
        total: Number(count.rows[0]?.total ?? 0),
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      },
    });
  });
});

app.post("/v1/vehicles", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("fleet.vehicles.create")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to add vehicles.");
  if (membership.role === "fleet_member" && !membership.fleet.policy.memberCanWrite) return fail(context, 403, "PERMISSION_DENIED", "Fleet members cannot add vehicles while this fleet policy is off.");
  const parsed = vehicleBodySchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return fail(context, 400, "VALIDATION_FAILED", "Check the vehicle details and try again.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const input = parsed.data;
    const result = await client.query<VehicleRecord>(`INSERT INTO vehicles (fleet_id, registration_number, make, model, year, colour, notes, insurance_expiry, road_tax_expiry, roadworthy_expiry, next_service_date, created_by, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12) RETURNING id, registration_number AS "registrationNumber", make, model, year, colour, notes, insurance_expiry AS "insuranceExpiry", road_tax_expiry AS "roadTaxExpiry", roadworthy_expiry AS "roadworthyExpiry", next_service_date AS "nextServiceDate", created_at AS "createdAt", updated_at AS "updatedAt"`, [membership.fleet.id, input.registrationNumber, input.make, input.model, input.year, input.colour ?? null, input.notes ?? null, input.insuranceExpiry ?? null, input.roadTaxExpiry ?? null, input.roadworthyExpiry ?? null, input.nextServiceDate ?? null, session.user.id]);
    const vehicle = result.rows[0];
    if (!vehicle) return fail(context, 500, "INTERNAL_ERROR", "The vehicle could not be created.", true);
    await writeWorkerAudit(client, session, "vehicle.created", "vehicle", vehicle.id, { registrationNumber: vehicle.registrationNumber });
    return context.json({ vehicle }, 201);
  });
});

app.get("/v1/vehicles/:vehicleId", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.some((permission) => ["fleet.vehicles.read", "finance.context.read"].includes(permission))) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to view vehicles.");
  const params = vehicleIdParamsSchema.safeParse(context.req.param());
  if (!params.success) return fail(context, 400, "VALIDATION_FAILED", "The vehicle ID is not valid.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const vehicle = await getWorkerVehicle(client, membership.fleet.id, params.data.vehicleId, false);
    return vehicle ? context.json({ vehicle: projectVehicle(vehicle, membership.permissions.includes("fleet.vehicles.read")) }) : fail(context, 404, "NOT_FOUND", "We could not find that vehicle in your fleet.");
  });
});

app.patch("/v1/vehicles/:vehicleId", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("fleet.vehicles.update")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to edit vehicles.");
  if (membership.role === "fleet_member" && !membership.fleet.policy.memberCanWrite) return fail(context, 403, "PERMISSION_DENIED", "Fleet members cannot edit vehicles while this fleet policy is off.");
  const params = vehicleIdParamsSchema.safeParse(context.req.param());
  const parsed = vehicleUpdateSchema.safeParse(await context.req.json().catch(() => null));
  if (!params.success || !parsed.success) return fail(context, 400, "VALIDATION_FAILED", "Check the vehicle details and try again.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const input = parsed.data;
    const values: unknown[] = [];
    const assignments: string[] = [];
    const columns: Array<[keyof typeof input, string]> = [["registrationNumber", "registration_number"], ["make", "make"], ["model", "model"], ["year", "year"], ["colour", "colour"], ["notes", "notes"], ["insuranceExpiry", "insurance_expiry"], ["roadTaxExpiry", "road_tax_expiry"], ["roadworthyExpiry", "roadworthy_expiry"], ["nextServiceDate", "next_service_date"]];
    for (const [key, column] of columns) {
      if (input[key] !== undefined) { assignments.push(`${column} = $${values.length + 1}`); values.push(input[key]); }
    }
    assignments.push(`updated_by = $${values.length + 1}`); values.push(session.user.id); assignments.push("updated_at = now()");
    values.push(params.data.vehicleId, membership.fleet.id);
    const result = await client.query<VehicleRecord>(`UPDATE vehicles SET ${assignments.join(", ")} WHERE id = $${values.length - 1} AND fleet_id = $${values.length} AND deleted_at IS NULL RETURNING id, registration_number AS "registrationNumber", make, model, year, colour, notes, insurance_expiry AS "insuranceExpiry", road_tax_expiry AS "roadTaxExpiry", roadworthy_expiry AS "roadworthyExpiry", next_service_date AS "nextServiceDate", created_at AS "createdAt", updated_at AS "updatedAt"`, values);
    const vehicle = result.rows[0];
    if (!vehicle) return fail(context, 404, "NOT_FOUND", "We could not find that vehicle in your fleet.");
    await writeWorkerAudit(client, session, "vehicle.updated", "vehicle", vehicle.id, { fields: Object.keys(input).sort() });
    return context.json({ vehicle });
  });
});

app.delete("/v1/vehicles/:vehicleId", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("fleet.vehicles.delete")) return fail(context, 403, "PERMISSION_DENIED", "Only fleet owners, administrators, and managers can remove vehicles.");
  const params = vehicleIdParamsSchema.safeParse(context.req.param());
  if (!params.success) return fail(context, 400, "VALIDATION_FAILED", "The vehicle ID is not valid.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const result = await client.query<VehicleRecord>(`UPDATE vehicles SET deleted_at = now(), deleted_by = $3, updated_by = $3, updated_at = now() WHERE id = $1 AND fleet_id = $2 AND deleted_at IS NULL RETURNING id, registration_number AS "registrationNumber", make, model, year, colour, notes, insurance_expiry AS "insuranceExpiry", road_tax_expiry AS "roadTaxExpiry", roadworthy_expiry AS "roadworthyExpiry", next_service_date AS "nextServiceDate", created_at AS "createdAt", updated_at AS "updatedAt"`, [params.data.vehicleId, membership.fleet.id, session.user.id]);
    const vehicle = result.rows[0];
    if (!vehicle) return fail(context, 404, "NOT_FOUND", "We could not find that vehicle in your fleet.");
    await writeWorkerAudit(client, session, "vehicle.deleted", "vehicle", vehicle.id, { registrationNumber: vehicle.registrationNumber });
    return context.json({ vehicle, deleted: true });
  });
});

app.post("/v1/vehicles/:vehicleId/restore", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("fleet.vehicles.restore")) return fail(context, 403, "PERMISSION_DENIED", "Only fleet owners, administrators, and managers can restore vehicles.");
  const params = vehicleIdParamsSchema.safeParse(context.req.param());
  if (!params.success) return fail(context, 400, "VALIDATION_FAILED", "The vehicle ID is not valid.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const result = await client.query<VehicleRecord>(`UPDATE vehicles SET deleted_at = NULL, deleted_by = NULL, updated_by = $3, updated_at = now() WHERE id = $1 AND fleet_id = $2 AND deleted_at IS NOT NULL RETURNING id, registration_number AS "registrationNumber", make, model, year, colour, notes, insurance_expiry AS "insuranceExpiry", road_tax_expiry AS "roadTaxExpiry", roadworthy_expiry AS "roadworthyExpiry", next_service_date AS "nextServiceDate", created_at AS "createdAt", updated_at AS "updatedAt"`, [params.data.vehicleId, membership.fleet.id, session.user.id]);
    const vehicle = result.rows[0];
    if (!vehicle) return fail(context, 404, "NOT_FOUND", "We could not find a removed vehicle with that ID.");
    await writeWorkerAudit(client, session, "vehicle.restored", "vehicle", vehicle.id, { registrationNumber: vehicle.registrationNumber });
    return context.json({ vehicle, restored: true });
  });
});

app.get("/v1/drivers", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.some((permission) => ["fleet.operations.read", "finance.context.read"].includes(permission))) {
    return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to view drivers.");
  }
  const parsed = driverQuerySchema.safeParse(Object.fromEntries(new URL(context.req.url).searchParams.entries()));
  if (!parsed.success) return fail(context, 400, "INVALID_REQUEST", "Check the driver search and page values, then try again.");

  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const search = parsed.data.search ? `%${escapeLike(parsed.data.search.toLowerCase())}%` : null;
    const values = [membership.fleet.id, search, parsed.data.status ?? null];
    const filter = `fleet_id = $1 AND ($2::text IS NULL OR lower(full_name) LIKE $2 ESCAPE '\\' OR lower(coalesce(phone, '')) LIKE $2 ESCAPE '\\' OR lower(coalesce(licence_number, '')) LIKE $2 ESCAPE '\\') AND ($3::driver_status IS NULL OR status = $3::driver_status)`;
    const count = await client.query<{ total: string }>(`SELECT count(*)::text AS total FROM drivers WHERE ${filter}`, values);
    const rows = await client.query<WorkerDriver>(
      `SELECT id, full_name AS "fullName", phone, licence_number AS "licenceNumber", licence_expiry AS "licenceExpiry", status, notes, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM drivers WHERE ${filter} ORDER BY full_name ASC, id ASC LIMIT $4 OFFSET $5`,
      [...values, parsed.data.limit, parsed.data.offset],
    );
    const fullRead = membership.permissions.includes("fleet.operations.read");
    return context.json({
      drivers: rows.rows.map((driver) => fullRead ? driver : { id: driver.id, fullName: driver.fullName, status: driver.status }),
      pagination: { total: Number(count.rows[0]?.total ?? 0), limit: parsed.data.limit, offset: parsed.data.offset },
    });
  });
});

app.post("/v1/drivers", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("fleet.operations.manage")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to manage drivers.");
  const parsed = driverBodySchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return fail(context, 400, "VALIDATION_FAILED", "Check the driver details and try again.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const input = parsed.data;
    const result = await client.query<WorkerDriver>(
      `INSERT INTO drivers (fleet_id, full_name, phone, licence_number, licence_expiry, status, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6::driver_status, $7, $8, $8)
       RETURNING id, full_name AS "fullName", phone, licence_number AS "licenceNumber", licence_expiry AS "licenceExpiry", status, notes, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [membership.fleet.id, input.fullName, input.phone ?? null, input.licenceNumber ?? null, input.licenceExpiry ?? null, input.status ?? "active", input.notes ?? null, session.user.id],
    );
    const driver = result.rows[0];
    if (!driver) return fail(context, 500, "INTERNAL_ERROR", "The driver could not be created.", true);
    await writeWorkerAudit(client, session, "driver.created", "driver", driver.id, { status: driver.status });
    return context.json({ driver }, 201);
  });
});

app.get("/v1/drivers/:driverId", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.some((permission) => ["fleet.operations.read", "finance.context.read"].includes(permission))) {
    return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to view drivers.");
  }
  const params = driverIdParamsSchema.safeParse(context.req.param());
  if (!params.success) return fail(context, 400, "VALIDATION_FAILED", "The driver ID is not valid.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const result = await client.query<WorkerDriver>(
      `SELECT id, full_name AS "fullName", phone, licence_number AS "licenceNumber", licence_expiry AS "licenceExpiry", status, notes, created_at AS "createdAt", updated_at AS "updatedAt" FROM drivers WHERE id = $1 AND fleet_id = $2`,
      [params.data.driverId, membership.fleet.id],
    );
    const driver = result.rows[0];
    if (!driver) return fail(context, 404, "NOT_FOUND", "We could not find that driver in your fleet.");
    return context.json({ driver: membership.permissions.includes("fleet.operations.read") ? driver : { id: driver.id, fullName: driver.fullName, status: driver.status } });
  });
});

app.patch("/v1/drivers/:driverId", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("fleet.operations.manage")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to manage drivers.");
  const params = driverIdParamsSchema.safeParse(context.req.param());
  const parsed = driverUpdateSchema.safeParse(await context.req.json().catch(() => null));
  if (!params.success || !parsed.success) return fail(context, 400, "VALIDATION_FAILED", "Check the driver details and try again.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const input = parsed.data;
    const values: unknown[] = [];
    const assignments: string[] = [];
    const columns: Array<[keyof typeof input, string]> = [["fullName", "full_name"], ["phone", "phone"], ["licenceNumber", "licence_number"], ["licenceExpiry", "licence_expiry"], ["status", "status"], ["notes", "notes"]];
    for (const [key, column] of columns) {
      if (input[key] !== undefined) {
        assignments.push(`${column} = $${values.length + 1}`);
        values.push(input[key]);
      }
    }
    assignments.push(`updated_by = $${values.length + 1}`);
    values.push(session.user.id);
    assignments.push("updated_at = now()");
    values.push(params.data.driverId, membership.fleet.id);
    const result = await client.query<WorkerDriver>(
      `UPDATE drivers SET ${assignments.join(", ")} WHERE id = $${values.length - 1} AND fleet_id = $${values.length} RETURNING id, full_name AS "fullName", phone, licence_number AS "licenceNumber", licence_expiry AS "licenceExpiry", status, notes, created_at AS "createdAt", updated_at AS "updatedAt"`,
      values,
    );
    const driver = result.rows[0];
    if (!driver) return fail(context, 404, "NOT_FOUND", "We could not find that driver in your fleet.");
    await writeWorkerAudit(client, session, "driver.updated", "driver", driver.id, { fields: Object.keys(input).sort() });
    return context.json({ driver });
  });
});

app.get("/v1/hires", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("fleet.operations.read")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to view hires.");
  const parsed = hireQuerySchema.safeParse(Object.fromEntries(new URL(context.req.url).searchParams.entries()));
  if (!parsed.success) return fail(context, 400, "INVALID_REQUEST", "Check the hire filters and try again.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const values = [membership.fleet.id, parsed.data.status ?? null, parsed.data.vehicleId ?? null, parsed.data.driverId ?? null];
    const filter = `h.fleet_id = $1 AND ($2::hire_status IS NULL OR h.status = $2::hire_status) AND ($3::uuid IS NULL OR h.vehicle_id = $3) AND ($4::uuid IS NULL OR h.driver_id = $4)`;
    const from = `FROM hires h LEFT JOIN vehicles v ON v.id = h.vehicle_id AND v.fleet_id = h.fleet_id LEFT JOIN drivers d ON d.id = h.driver_id AND d.fleet_id = h.fleet_id`;
    const count = await client.query<{ total: string }>(`SELECT count(*)::text AS total ${from} WHERE ${filter}`, values);
    const rows = await client.query<WorkerHire>(
      `SELECT h.id, h.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", h.driver_id AS "driverId", d.full_name AS "driverName", h.status, h.starts_at AS "startsAt", h.expected_end_at AS "expectedEndAt", h.actual_end_at AS "actualEndAt", h.notes, h.created_at AS "createdAt", h.updated_at AS "updatedAt" ${from} WHERE ${filter} ORDER BY h.starts_at DESC, h.id DESC LIMIT $5 OFFSET $6`,
      [...values, parsed.data.limit, parsed.data.offset],
    );
    return context.json({ hires: rows.rows, pagination: { total: Number(count.rows[0]?.total ?? 0), limit: parsed.data.limit, offset: parsed.data.offset } });
  });
});

app.post("/v1/hires", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("fleet.operations.manage")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to manage hires.");
  const parsed = hireBodySchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return fail(context, 400, "VALIDATION_FAILED", "Check the hire details and try again.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const input = parsed.data;
    const result = await client.query<{ id: string }>(
      `INSERT INTO hires (fleet_id, vehicle_id, driver_id, status, starts_at, expected_end_at, actual_end_at, notes, created_by, updated_by) VALUES ($1, $2, $3, $4::hire_status, $5, $6, $7, $8, $9, $9) RETURNING id`,
      [membership.fleet.id, input.vehicleId, input.driverId, input.status, input.startsAt, input.expectedEndAt ?? null, input.actualEndAt ?? null, input.notes ?? null, session.user.id],
    );
    const id = result.rows[0]?.id;
    if (!id) return fail(context, 500, "INTERNAL_ERROR", "The hire could not be created.", true);
    const hire = await getWorkerHire(client, membership.fleet.id, id);
    if (!hire) return fail(context, 500, "INTERNAL_ERROR", "The hire could not be loaded.", true);
    await writeWorkerAudit(client, session, "hire.created", "hire", id, { status: hire.status });
    return context.json({ hire }, 201);
  });
});

app.get("/v1/hires/:hireId", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("fleet.operations.read")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to view hires.");
  const params = hireIdParamsSchema.safeParse(context.req.param());
  if (!params.success) return fail(context, 400, "VALIDATION_FAILED", "The hire ID is not valid.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const hire = await getWorkerHire(client, membership.fleet.id, params.data.hireId);
    return hire ? context.json({ hire }) : fail(context, 404, "NOT_FOUND", "We could not find that hire in your fleet.");
  });
});

app.patch("/v1/hires/:hireId", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("fleet.operations.manage")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to manage hires.");
  const params = hireIdParamsSchema.safeParse(context.req.param());
  const parsed = hireUpdateSchema.safeParse(await context.req.json().catch(() => null));
  if (!params.success || !parsed.success) return fail(context, 400, "VALIDATION_FAILED", "Check the hire details and try again.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const input = parsed.data;
    const values: unknown[] = [];
    const assignments: string[] = [];
    const columns: Array<[keyof typeof input, string]> = [["vehicleId", "vehicle_id"], ["driverId", "driver_id"], ["status", "status"], ["startsAt", "starts_at"], ["expectedEndAt", "expected_end_at"], ["actualEndAt", "actual_end_at"], ["notes", "notes"]];
    for (const [key, column] of columns) {
      if (input[key] !== undefined) {
        assignments.push(`${column} = $${values.length + 1}`);
        values.push(input[key]);
      }
    }
    assignments.push(`updated_by = $${values.length + 1}`);
    values.push(session.user.id);
    assignments.push("updated_at = now()");
    values.push(params.data.hireId, membership.fleet.id);
    const result = await client.query<{ id: string }>(`UPDATE hires SET ${assignments.join(", ")} WHERE id = $${values.length - 1} AND fleet_id = $${values.length} RETURNING id`, values);
    if (!result.rows[0]) return fail(context, 404, "NOT_FOUND", "We could not find that hire in your fleet.");
    const hire = await getWorkerHire(client, membership.fleet.id, params.data.hireId);
    if (!hire) return fail(context, 404, "NOT_FOUND", "We could not find that hire in your fleet.");
    await writeWorkerAudit(client, session, "hire.updated", "hire", hire.id, { fields: Object.keys(input).sort() });
    return context.json({ hire });
  });
});

app.get("/v1/expenses", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("finance.expenses.read")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to view expenses.");
  const parsed = financeQuerySchema.safeParse(Object.fromEntries(new URL(context.req.url).searchParams.entries()));
  if (!parsed.success) return fail(context, 400, "INVALID_REQUEST", "Check the expense filters and page values, then try again.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const search = parsed.data.search ? `%${escapeLike(parsed.data.search.toLowerCase())}%` : null;
    const values = [membership.fleet.id, parsed.data.from ?? null, parsed.data.to ?? null, parsed.data.vehicleId ?? null, parsed.data.status ?? null, search];
    const filter = `e.fleet_id = $1 AND ($2::date IS NULL OR e.entry_date >= $2::date) AND ($3::date IS NULL OR e.entry_date <= $3::date) AND ($4::uuid IS NULL OR e.vehicle_id = $4) AND ($5::finance_status IS NULL OR e.status = $5::finance_status) AND ($6::text IS NULL OR lower(e.description) LIKE $6 ESCAPE '\\' OR lower(e.category) LIKE $6 ESCAPE '\\' OR lower(coalesce(e.supplier, '')) LIKE $6 ESCAPE '\\')`;
    const count = await client.query<{ total: string }>(`SELECT count(*)::text AS total FROM expenses e WHERE ${filter}`, values);
    const rows = await client.query<WorkerExpense>(`SELECT e.id, e.entry_date AS "entryDate", e.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", trim(concat_ws(' ', v.make, v.model)) AS "vehicleName", e.category, e.description, e.amount::text AS amount, e.currency, e.supplier, e.payment_method AS "paymentMethod", e.notes, e.status, e.void_reason AS "voidReason", e.voided_at AS "voidedAt", e.created_at AS "createdAt", e.updated_at AS "updatedAt" FROM expenses e LEFT JOIN vehicles v ON v.id = e.vehicle_id AND v.fleet_id = e.fleet_id WHERE ${filter} ORDER BY e.entry_date DESC, e.created_at DESC, e.id DESC LIMIT $7 OFFSET $8`, [...values, parsed.data.limit, parsed.data.offset]);
    return context.json({ expenses: rows.rows, pagination: { total: Number(count.rows[0]?.total ?? 0), limit: parsed.data.limit, offset: parsed.data.offset } });
  });
});

app.post("/v1/expenses", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("finance.expenses.manage")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to manage expenses.");
  const parsed = expenseBodySchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return fail(context, 400, "VALIDATION_FAILED", "Check the expense details and try again.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const input = parsed.data;
    const inserted = await client.query<{ id: string }>(`INSERT INTO expenses (fleet_id, vehicle_id, entry_date, category, description, amount, currency, supplier, payment_method, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10, $11) RETURNING id`, [membership.fleet.id, input.vehicleId, input.entryDate, input.category, input.description, input.amount, input.currency, input.supplier ?? null, input.paymentMethod ?? null, input.notes ?? null, session.user.id]);
    const id = inserted.rows[0]?.id;
    if (!id) return fail(context, 500, "INTERNAL_ERROR", "The expense could not be created.", true);
    const expense = await getWorkerExpense(client, membership.fleet.id, id);
    if (!expense) return fail(context, 500, "INTERNAL_ERROR", "The expense could not be loaded.", true);
    await writeWorkerAudit(client, session, "expense.created", "expense", id, { amount: expense.amount, currency: expense.currency });
    return context.json({ expense }, 201);
  });
});

app.get("/v1/expenses/:recordId", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("finance.expenses.read")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to view expenses.");
  const params = financeIdParamsSchema.safeParse(context.req.param());
  if (!params.success) return fail(context, 400, "VALIDATION_FAILED", "The expense ID is not valid.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const expense = await getWorkerExpense(client, membership.fleet.id, params.data.recordId);
    return expense ? context.json({ expense }) : fail(context, 404, "NOT_FOUND", "We could not find that expense in your fleet.");
  });
});

app.post("/v1/expenses/:recordId/void", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("finance.expenses.manage")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to manage expenses.");
  const params = financeIdParamsSchema.safeParse(context.req.param());
  const body = voidBodySchema.safeParse(await context.req.json().catch(() => null));
  if (!params.success || !body.success) return fail(context, 400, "VALIDATION_FAILED", "Provide a short reason for voiding this expense.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const updated = await client.query<{ id: string }>(`UPDATE expenses SET status = 'voided', void_reason = $3, voided_at = now(), voided_by = $4, updated_at = now() WHERE id = $1 AND fleet_id = $2 AND status = 'posted' RETURNING id`, [params.data.recordId, membership.fleet.id, body.data.reason, session.user.id]);
    if (!updated.rows[0]) return fail(context, 404, "NOT_FOUND", "We could not find an active expense in your fleet.");
    const expense = await getWorkerExpense(client, membership.fleet.id, params.data.recordId);
    if (!expense) return fail(context, 500, "INTERNAL_ERROR", "The expense could not be loaded.", true);
    await writeWorkerAudit(client, session, "expense.voided", "expense", expense.id, { reason: body.data.reason });
    return context.json({ expense });
  });
});

app.get("/v1/income", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("finance.income.read")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to view income.");
  const parsed = financeQuerySchema.safeParse(Object.fromEntries(new URL(context.req.url).searchParams.entries()));
  if (!parsed.success) return fail(context, 400, "INVALID_REQUEST", "Check the income filters and page values, then try again.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const search = parsed.data.search ? `%${escapeLike(parsed.data.search.toLowerCase())}%` : null;
    const values = [membership.fleet.id, parsed.data.from ?? null, parsed.data.to ?? null, parsed.data.vehicleId ?? null, parsed.data.driverId ?? null, parsed.data.status ?? null, search];
    const filter = `i.fleet_id = $1 AND ($2::date IS NULL OR i.entry_date >= $2::date) AND ($3::date IS NULL OR i.entry_date <= $3::date) AND ($4::uuid IS NULL OR i.vehicle_id = $4) AND ($5::uuid IS NULL OR i.driver_id = $5) AND ($6::finance_status IS NULL OR i.status = $6::finance_status) AND ($7::text IS NULL OR lower(i.description) LIKE $7 ESCAPE '\\' OR lower(coalesce(i.reference, '')) LIKE $7 ESCAPE '\\')`;
    const count = await client.query<{ total: string }>(`SELECT count(*)::text AS total FROM income_entries i WHERE ${filter}`, values);
    const rows = await client.query<WorkerIncome>(`SELECT i.id, i.entry_date AS "entryDate", i.description, i.amount::text AS amount, i.currency, i.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", trim(concat_ws(' ', v.make, v.model)) AS "vehicleName", i.driver_id AS "driverId", d.full_name AS "driverName", i.payment_method AS "paymentMethod", i.reference, i.notes, i.status, i.void_reason AS "voidReason", i.voided_at AS "voidedAt", i.created_at AS "createdAt", i.updated_at AS "updatedAt" FROM income_entries i LEFT JOIN vehicles v ON v.id = i.vehicle_id AND v.fleet_id = i.fleet_id LEFT JOIN drivers d ON d.id = i.driver_id AND d.fleet_id = i.fleet_id WHERE ${filter} ORDER BY i.entry_date DESC, i.created_at DESC, i.id DESC LIMIT $8 OFFSET $9`, [...values, parsed.data.limit, parsed.data.offset]);
    return context.json({ income: rows.rows, pagination: { total: Number(count.rows[0]?.total ?? 0), limit: parsed.data.limit, offset: parsed.data.offset } });
  });
});

app.post("/v1/income", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("finance.income.manage")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to manage income.");
  const parsed = incomeBodySchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return fail(context, 400, "VALIDATION_FAILED", "Check the income details and try again.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const input = parsed.data;
    const inserted = await client.query<{ id: string }>(`INSERT INTO income_entries (fleet_id, entry_date, description, amount, currency, vehicle_id, driver_id, payment_method, reference, notes, created_by) VALUES ($1, $2, $3, $4::numeric, $5, $6, $7, $8, $9, $10, $11) RETURNING id`, [membership.fleet.id, input.entryDate, input.description, input.amount, input.currency, input.vehicleId ?? null, input.driverId ?? null, input.paymentMethod ?? null, input.reference ?? null, input.notes ?? null, session.user.id]);
    const id = inserted.rows[0]?.id;
    if (!id) return fail(context, 500, "INTERNAL_ERROR", "The income record could not be created.", true);
    const income = await getWorkerIncome(client, membership.fleet.id, id);
    if (!income) return fail(context, 500, "INTERNAL_ERROR", "The income record could not be loaded.", true);
    await writeWorkerAudit(client, session, "income.created", "income", id, { amount: income.amount, currency: income.currency });
    return context.json({ income }, 201);
  });
});

app.get("/v1/income/:recordId", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("finance.income.read")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to view income.");
  const params = financeIdParamsSchema.safeParse(context.req.param());
  if (!params.success) return fail(context, 400, "VALIDATION_FAILED", "The income record ID is not valid.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const income = await getWorkerIncome(client, membership.fleet.id, params.data.recordId);
    return income ? context.json({ income }) : fail(context, 404, "NOT_FOUND", "We could not find that income record in your fleet.");
  });
});

app.post("/v1/income/:recordId/void", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("finance.income.manage")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to manage income.");
  const params = financeIdParamsSchema.safeParse(context.req.param());
  const body = voidBodySchema.safeParse(await context.req.json().catch(() => null));
  if (!params.success || !body.success) return fail(context, 400, "VALIDATION_FAILED", "Provide a short reason for voiding this income record.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const updated = await client.query<{ id: string }>(`UPDATE income_entries SET status = 'voided', void_reason = $3, voided_at = now(), voided_by = $4, updated_at = now() WHERE id = $1 AND fleet_id = $2 AND status = 'posted' RETURNING id`, [params.data.recordId, membership.fleet.id, body.data.reason, session.user.id]);
    if (!updated.rows[0]) return fail(context, 404, "NOT_FOUND", "We could not find an active income record in your fleet.");
    const income = await getWorkerIncome(client, membership.fleet.id, params.data.recordId);
    if (!income) return fail(context, 500, "INTERNAL_ERROR", "The income record could not be loaded.", true);
    await writeWorkerAudit(client, session, "income.voided", "income", income.id, { reason: body.data.reason });
    return context.json({ income });
  });
});

app.get("/v1/remittances", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("finance.remittances.read")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to view remittances.");
  const parsed = financeQuerySchema.safeParse(Object.fromEntries(new URL(context.req.url).searchParams.entries()));
  if (!parsed.success) return fail(context, 400, "INVALID_REQUEST", "Check the remittance filters and page values, then try again.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const search = parsed.data.search ? `%${escapeLike(parsed.data.search.toLowerCase())}%` : null;
    const values = [membership.fleet.id, parsed.data.from ?? null, parsed.data.to ?? null, parsed.data.vehicleId ?? null, parsed.data.driverId ?? null, parsed.data.status ?? null, search];
    const filter = `r.fleet_id = $1 AND ($2::date IS NULL OR r.entry_date >= $2::date) AND ($3::date IS NULL OR r.entry_date <= $3::date) AND ($4::uuid IS NULL OR r.vehicle_id = $4) AND ($5::uuid IS NULL OR r.driver_id = $5) AND ($6::finance_status IS NULL OR r.status = $6::finance_status) AND ($7::text IS NULL OR lower(coalesce(r.reference, '')) LIKE $7 ESCAPE '\\' OR lower(coalesce(r.notes, '')) LIKE $7 ESCAPE '\\' OR lower(coalesce(d.full_name, '')) LIKE $7 ESCAPE '\\')`;
    const count = await client.query<{ total: string }>(`SELECT count(*)::text AS total FROM remittances r LEFT JOIN drivers d ON d.id = r.driver_id AND d.fleet_id = r.fleet_id WHERE ${filter}`, values);
    const rows = await client.query<WorkerRemittance>(`SELECT r.id, r.entry_date AS "entryDate", r.driver_id AS "driverId", d.full_name AS "driverName", r.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", trim(concat_ws(' ', v.make, v.model)) AS "vehicleName", r.period_start AS "periodStart", r.period_end AS "periodEnd", r.amount::text AS amount, r.currency, r.payment_method AS "paymentMethod", r.reference, r.notes, r.status, r.void_reason AS "voidReason", r.voided_at AS "voidedAt", r.created_at AS "createdAt", r.updated_at AS "updatedAt" FROM remittances r LEFT JOIN drivers d ON d.id = r.driver_id AND d.fleet_id = r.fleet_id LEFT JOIN vehicles v ON v.id = r.vehicle_id AND v.fleet_id = r.fleet_id WHERE ${filter} ORDER BY r.entry_date DESC, r.created_at DESC, r.id DESC LIMIT $8 OFFSET $9`, [...values, parsed.data.limit, parsed.data.offset]);
    return context.json({ remittances: rows.rows, pagination: { total: Number(count.rows[0]?.total ?? 0), limit: parsed.data.limit, offset: parsed.data.offset } });
  });
});

app.post("/v1/remittances", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("finance.remittances.manage")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to manage remittances.");
  const parsed = remittanceBodySchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return fail(context, 400, "VALIDATION_FAILED", "Check the remittance details and try again.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const input = parsed.data;
    const inserted = await client.query<{ id: string }>(`INSERT INTO remittances (fleet_id, entry_date, driver_id, period_start, period_end, amount, currency, vehicle_id, payment_method, reference, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10, $11, $12) RETURNING id`, [membership.fleet.id, input.entryDate, input.driverId, input.periodStart, input.periodEnd, input.amount, input.currency, input.vehicleId ?? null, input.paymentMethod ?? null, input.reference ?? null, input.notes ?? null, session.user.id]);
    const id = inserted.rows[0]?.id;
    if (!id) return fail(context, 500, "INTERNAL_ERROR", "The remittance could not be created.", true);
    const remittance = await getWorkerRemittance(client, membership.fleet.id, id);
    if (!remittance) return fail(context, 500, "INTERNAL_ERROR", "The remittance could not be loaded.", true);
    await writeWorkerAudit(client, session, "remittance.created", "remittance", id, { amount: remittance.amount, currency: remittance.currency });
    return context.json({ remittance }, 201);
  });
});

app.get("/v1/remittances/:recordId", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("finance.remittances.read")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to view remittances.");
  const params = financeIdParamsSchema.safeParse(context.req.param());
  if (!params.success) return fail(context, 400, "VALIDATION_FAILED", "The remittance ID is not valid.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const remittance = await getWorkerRemittance(client, membership.fleet.id, params.data.recordId);
    return remittance ? context.json({ remittance }) : fail(context, 404, "NOT_FOUND", "We could not find that remittance in your fleet.");
  });
});

app.post("/v1/remittances/:recordId/void", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("finance.remittances.manage")) return fail(context, 403, "PERMISSION_DENIED", "You do not have permission to manage remittances.");
  const params = financeIdParamsSchema.safeParse(context.req.param());
  const body = voidBodySchema.safeParse(await context.req.json().catch(() => null));
  if (!params.success || !body.success) return fail(context, 400, "VALIDATION_FAILED", "Provide a short reason for voiding this remittance.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const updated = await client.query<{ id: string }>(`UPDATE remittances SET status = 'voided', void_reason = $3, voided_at = now(), voided_by = $4, updated_at = now() WHERE id = $1 AND fleet_id = $2 AND status = 'posted' RETURNING id`, [params.data.recordId, membership.fleet.id, body.data.reason, session.user.id]);
    if (!updated.rows[0]) return fail(context, 404, "NOT_FOUND", "We could not find an active remittance in your fleet.");
    const remittance = await getWorkerRemittance(client, membership.fleet.id, params.data.recordId);
    if (!remittance) return fail(context, 500, "INTERNAL_ERROR", "The remittance could not be loaded.", true);
    await writeWorkerAudit(client, session, "remittance.voided", "remittance", remittance.id, { reason: body.data.reason });
    return context.json({ remittance });
  });
});

app.get("/v1/members/invitations", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("fleet.members.read")) return fail(context, 403, "PERMISSION_DENIED", "Only fleet owners and administrators can view invitations.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const result = await client.query<WorkerInvitation>(`SELECT id, invited_email AS "invitedEmail", role, status, invited_at AS "invitedAt", expires_at AS "expiresAt", accepted_at AS "acceptedAt", revoked_at AS "revokedAt" FROM fleet_invitations WHERE fleet_id = $1 ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, invited_at DESC, id DESC`, [membership.fleet.id]);
    return context.json({ invitations: result.rows });
  });
});

app.post("/v1/members/invitations", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("fleet.members.manage")) return fail(context, 403, "PERMISSION_DENIED", "Only fleet owners and administrators can invite people.");
  const parsed = membershipInvitationBodySchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return fail(context, 400, "VALIDATION_FAILED", "Check the invitation email and role, then try again.");
  const ownerAllowed = ["fleet_admin", "fleet_manager", "finance_manager", "fleet_member", "read_only"] as const;
  const adminAllowed = ["fleet_manager", "finance_manager", "fleet_member", "read_only"] as const;
  const allowed = membership.role === "fleet_owner" ? ownerAllowed : adminAllowed;
  if (!(allowed as readonly string[]).includes(parsed.data.role)) return fail(context, 403, "PERMISSION_DENIED", "Only a fleet owner can invite an administrator.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const result = await client.query<WorkerInvitation>(`INSERT INTO fleet_invitations (fleet_id, invited_email, role, invited_by, expires_at) VALUES ($1, $2, $3::fleet_role, $4, $5) RETURNING id, invited_email AS "invitedEmail", role, status, invited_at AS "invitedAt", expires_at AS "expiresAt", accepted_at AS "acceptedAt", revoked_at AS "revokedAt"`, [membership.fleet.id, parsed.data.email, parsed.data.role, session.user.id, expiresAt]);
    const invitation = result.rows[0];
    if (!invitation) return fail(context, 500, "INTERNAL_ERROR", "The invitation could not be created.", true);
    await writeWorkerAudit(client, session, "membership.invited", "fleet_invitation", invitation.id, { role: invitation.role });
    return context.json({ invitation }, 201);
  });
});

app.delete("/v1/members/invitations/:invitationId", authenticate, requireFleet, async (context) => {
  const session = context.get("session");
  const membership = session.membership;
  if (!membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (!membership.permissions.includes("fleet.members.manage")) return fail(context, 403, "PERMISSION_DENIED", "Only fleet owners and administrators can revoke invitations.");
  const params = membershipInvitationParamsSchema.safeParse(context.req.param());
  if (!params.success) return fail(context, 400, "VALIDATION_FAILED", "The invitation ID is not valid.");
  return withFleetContext(context.env, { ...session, membership }, async (client) => {
    const result = await client.query<WorkerInvitation>(`UPDATE fleet_invitations SET status = 'revoked', revoked_at = now() WHERE id = $1 AND fleet_id = $2 AND status = 'pending' RETURNING id, invited_email AS "invitedEmail", role, status, invited_at AS "invitedAt", expires_at AS "expiresAt", accepted_at AS "acceptedAt", revoked_at AS "revokedAt"`, [params.data.invitationId, membership.fleet.id]);
    const invitation = result.rows[0];
    if (!invitation) return fail(context, 404, "NOT_FOUND", "We could not find an active invitation.");
    await writeWorkerAudit(client, session, "membership.invitation_revoked", "fleet_invitation", invitation.id, { role: invitation.role });
    return context.json({ invitation });
  });
});

app.post("/v1/members/invitations/:invitationId/accept", authenticate, async (context) => {
  const session = context.get("session");
  const params = membershipInvitationParamsSchema.safeParse(context.req.param());
  if (!params.success) return fail(context, 400, "VALIDATION_FAILED", "The invitation ID is not valid.");
  return withUserContext(context.env, session, async (client) => {
    const result = await client.query<{ membershipId: string; fleetId: string; role: string }>(`SELECT membership_id AS "membershipId", fleet_id AS "fleetId", role FROM app_security.accept_fleet_invitation($1::uuid)`, [params.data.invitationId]);
    const accepted = result.rows[0];
    if (!accepted || !isFleetRole(accepted.role) || accepted.role === "fleet_owner") return fail(context, 404, "NOT_FOUND", "There is no active invitation for this account.");
    return context.json({ invitation: { membershipId: accepted.membershipId, fleetId: accepted.fleetId, role: accepted.role } });
  });
});

app.notFound((context) =>
  fail(context, 404, "ROUTE_NOT_FOUND", "This endpoint does not exist. Check that the app is up to date and try again."),
);

app.onError((error, context) => {
  // Do not log error objects: PostgreSQL and provider errors can contain query or connection details.
  console.error(JSON.stringify({ requestId: context.get("requestId"), code: "REQUEST_FAILED", errorType: error instanceof Error ? error.name : "UnknownError" }));
  return fail(context, 500, "INTERNAL_ERROR", "The request could not be completed. Try again shortly.", true);
});

type AppContext = Context<{ Bindings: Env; Variables: { requestId: string; session: Session } }>;

async function authenticate(context: AppContext, next: Next): Promise<Response | void> {
  const { AUTH_ISSUER: issuer, AUTH_AUDIENCE: audience, AUTH_JWKS_URL: jwksUrl } = context.env;
  if (!issuer || !audience || !jwksUrl) {
    return fail(context, 503, "AUTH_NOT_CONFIGURED", "Sign in is temporarily unavailable.", true);
  }
  const authorization = context.req.header("authorization");
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return fail(context, 401, "AUTH_REQUIRED", "Sign in to continue.");

  let subject: string;
  try {
    const cacheKey = `${issuer}\n${audience}\n${jwksUrl}\n${context.env.AUTH_CLOCK_TOLERANCE_SECONDS ?? "30"}`;
    let verifier = verifierCache.get(cacheKey);
    if (!verifier) {
      const tolerance = Number(context.env.AUTH_CLOCK_TOLERANCE_SECONDS ?? "30");
      verifier = createTokenVerifier({
        issuer,
        audience,
        jwksUrl,
        clockToleranceSeconds: Number.isInteger(tolerance) && tolerance >= 0 && tolerance <= 120 ? tolerance : 30,
      }) ?? undefined;
      if (verifier) verifierCache.set(cacheKey, verifier);
    }
    if (!verifier) throw new Error("Auth verifier is unavailable");
    subject = (await verifier.verify(token)).subject;
  } catch {
    return fail(context, 401, "AUTH_INVALID", "Your session is invalid or expired. Sign in again.");
  }

  let session: Session | null;
  try {
    session = await resolveSession(context.env, subject);
  } catch {
    return fail(context, 503, "AUTH_UNAVAILABLE", "We could not verify your fleet access. Try again shortly.", true);
  }
  if (!session) return fail(context, 403, "ACCOUNT_NOT_PROVISIONED", "Your account is not yet set up for fleet access. Contact your fleet administrator.");
  context.set("session", session);
  await next();
}

async function requireFleet(context: AppContext, next: Next): Promise<Response | void> {
  const session = context.get("session");
  if (!session.membership) return fail(context, 403, "NO_ACTIVE_FLEET", "Your account has no active fleet membership.");
  if (session.membership.fleet.status !== "active") return fail(context, 403, "FLEET_INACTIVE", "This fleet is currently unavailable.");
  await next();
}

async function resolveSession(env: Env, subject: string): Promise<Session | null> {
  return withTransaction(env, async (client) => {
    await client.query("SELECT set_config('app.idp_subject', $1, true)", [subject]);
    const users = await client.query<{ id: string; display_name: string; status: string }>(
      "SELECT id, display_name, status FROM users WHERE idp_subject = $1",
      [subject],
    );
    const user = users.rows[0];
    if (!user || user.status !== "active") return null;
    await client.query("SELECT set_config('app.user_id', $1, true)", [user.id]);

    const memberships = await client.query<{ id: string; fleet_id: string; role: string; status: string }>(
      "SELECT id, fleet_id, role, status FROM fleet_memberships WHERE user_id = $1 AND status = 'active'",
      [user.id],
    );
    if (memberships.rows.length > 1) throw new Error("Membership conflict");
    const membershipRow = memberships.rows[0];
    const admins = await client.query<{ is_admin: boolean }>("SELECT app_security.is_platform_admin() AS is_admin");

    if (!membershipRow) {
      return { user: { id: user.id, displayName: user.display_name }, platformAdmin: admins.rows[0]?.is_admin === true, membership: null };
    }

    if (!isFleetRole(membershipRow.role)) throw new Error("Invalid membership role");
    const permissions = permissionsForRole(membershipRow.role);

    await client.query("SELECT set_config('app.fleet_id', $1, true), set_config('app.role', $2, true), set_config('app.permissions', $3, true)", [membershipRow.fleet_id, membershipRow.role, permissions.join(",")]);
    const fleets = await client.query<{ id: string; name: string; status: string; policy: unknown }>(
      "SELECT id, name, status, policy FROM fleets WHERE id = $1",
      [membershipRow.fleet_id],
    );
    const fleet = fleets.rows[0];
    if (!fleet) throw new Error("Fleet missing");
    if (!isFleetStatus(fleet.status)) throw new Error("Invalid fleet status");
    const policy = normalizeFleetPolicy(fleet.policy);
    return {
      user: { id: user.id, displayName: user.display_name },
      platformAdmin: admins.rows[0]?.is_admin === true,
      membership: {
        id: membershipRow.id,
        role: membershipRow.role,
        permissions,
        fleet: { id: fleet.id, name: fleet.name, status: fleet.status, policy },
      },
    };
  });
}

async function withFleetContext<T>(env: Env, session: FleetSession, work: (client: Client) => Promise<T>): Promise<T> {
  return withTransaction(env, async (client) => {
    const membership = session.membership;
    if (!membership) throw new Error("Fleet membership required");
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.fleet_id', $2, true), set_config('app.role', $3, true), set_config('app.permissions', $4, true)",
      [session.user.id, membership.fleet.id, membership.role, membership.permissions.join(",")],
    );
    return work(client);
  });
}

async function withUserContext<T>(env: Env, session: Session, work: (client: Client) => Promise<T>): Promise<T> {
  return withTransaction(env, async (client) => {
    await client.query("SELECT set_config('app.user_id', $1, true)", [session.user.id]);
    return work(client);
  });
}

async function withTransaction<T>(env: Env, work: (client: Client) => Promise<T>): Promise<T> {
  if (!env.HYPERDRIVE?.connectionString) throw new Error("Database binding is not configured");
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('statement_timeout', '5s', true), set_config('idle_in_transaction_session_timeout', '10s', true), set_config('TimeZone', 'UTC', true)");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function writeWorkerAudit(
  client: Client,
  session: Session,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (
       actor_user_id, actor_type, fleet_id, action, target_type, target_id,
       correlation_id, metadata
     ) VALUES ($1, 'user'::audit_actor_type, $2, $3, $4, $5, $6, $7::jsonb)`,
    [session.user.id, session.membership?.fleet.id ?? null, action, targetType, targetId, crypto.randomUUID(), JSON.stringify(metadata)],
  );
}

async function getWorkerHire(client: Client, fleetId: string, hireId: string): Promise<WorkerHire | null> {
  const result = await client.query<WorkerHire>(
    `SELECT h.id, h.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", h.driver_id AS "driverId", d.full_name AS "driverName", h.status, h.starts_at AS "startsAt", h.expected_end_at AS "expectedEndAt", h.actual_end_at AS "actualEndAt", h.notes, h.created_at AS "createdAt", h.updated_at AS "updatedAt"
     FROM hires h
     LEFT JOIN vehicles v ON v.id = h.vehicle_id AND v.fleet_id = h.fleet_id
     LEFT JOIN drivers d ON d.id = h.driver_id AND d.fleet_id = h.fleet_id
     WHERE h.id = $1 AND h.fleet_id = $2`,
    [hireId, fleetId],
  );
  return result.rows[0] ?? null;
}

async function getWorkerExpense(client: Client, fleetId: string, expenseId: string): Promise<WorkerExpense | null> {
  const result = await client.query<WorkerExpense>(
    `SELECT e.id, e.entry_date AS "entryDate", e.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", trim(concat_ws(' ', v.make, v.model)) AS "vehicleName", e.category, e.description, e.amount::text AS amount, e.currency, e.supplier, e.payment_method AS "paymentMethod", e.notes, e.status, e.void_reason AS "voidReason", e.voided_at AS "voidedAt", e.created_at AS "createdAt", e.updated_at AS "updatedAt"
     FROM expenses e
     LEFT JOIN vehicles v ON v.id = e.vehicle_id AND v.fleet_id = e.fleet_id
     WHERE e.id = $1 AND e.fleet_id = $2`,
    [expenseId, fleetId],
  );
  return result.rows[0] ?? null;
}

async function getWorkerIncome(client: Client, fleetId: string, incomeId: string): Promise<WorkerIncome | null> {
  const result = await client.query<WorkerIncome>(
    `SELECT i.id, i.entry_date AS "entryDate", i.description, i.amount::text AS amount, i.currency, i.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", trim(concat_ws(' ', v.make, v.model)) AS "vehicleName", i.driver_id AS "driverId", d.full_name AS "driverName", i.payment_method AS "paymentMethod", i.reference, i.notes, i.status, i.void_reason AS "voidReason", i.voided_at AS "voidedAt", i.created_at AS "createdAt", i.updated_at AS "updatedAt"
     FROM income_entries i
     LEFT JOIN vehicles v ON v.id = i.vehicle_id AND v.fleet_id = i.fleet_id
     LEFT JOIN drivers d ON d.id = i.driver_id AND d.fleet_id = i.fleet_id
     WHERE i.id = $1 AND i.fleet_id = $2`,
    [incomeId, fleetId],
  );
  return result.rows[0] ?? null;
}

async function getWorkerRemittance(client: Client, fleetId: string, remittanceId: string): Promise<WorkerRemittance | null> {
  const result = await client.query<WorkerRemittance>(
    `SELECT r.id, r.entry_date AS "entryDate", r.driver_id AS "driverId", d.full_name AS "driverName", r.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", trim(concat_ws(' ', v.make, v.model)) AS "vehicleName", r.period_start AS "periodStart", r.period_end AS "periodEnd", r.amount::text AS amount, r.currency, r.payment_method AS "paymentMethod", r.reference, r.notes, r.status, r.void_reason AS "voidReason", r.voided_at AS "voidedAt", r.created_at AS "createdAt", r.updated_at AS "updatedAt"
     FROM remittances r
     LEFT JOIN drivers d ON d.id = r.driver_id AND d.fleet_id = r.fleet_id
     LEFT JOIN vehicles v ON v.id = r.vehicle_id AND v.fleet_id = r.fleet_id
     WHERE r.id = $1 AND r.fleet_id = $2`,
    [remittanceId, fleetId],
  );
  return result.rows[0] ?? null;
}

async function getWorkerVehicle(client: Client, fleetId: string, vehicleId: string, includeDeleted: boolean): Promise<VehicleRecord | null> {
  const result = await client.query<VehicleRecord>(
    `SELECT id, registration_number AS "registrationNumber", make, model, year, colour, notes, insurance_expiry AS "insuranceExpiry", road_tax_expiry AS "roadTaxExpiry", roadworthy_expiry AS "roadworthyExpiry", next_service_date AS "nextServiceDate", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM vehicles WHERE id = $1 AND fleet_id = $2 ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
    [vehicleId, fleetId],
  );
  return result.rows[0] ?? null;
}

function projectVehicle(vehicle: VehicleRecord, fullRead: boolean): VehicleRecord | Pick<VehicleRecord, "id" | "registrationNumber" | "make" | "model" | "year"> {
  if (fullRead) return vehicle;
  return { id: vehicle.id, registrationNumber: vehicle.registrationNumber, make: vehicle.make, model: vehicle.model, year: vehicle.year };
}

function isFleetStatus(value: string): value is "pending" | "active" | "suspended" | "closed" {
  return ["pending", "active", "suspended", "closed"].includes(value);
}

function safeRequestId(value: string | undefined): string | null {
  return value && /^[A-Za-z0-9._-]{8,80}$/.test(value) ? value : null;
}

function fail(context: AppContext, status: 400 | 401 | 403 | 404 | 500 | 503, code: string, message: string, retryable = false): Response {
  const payload: ErrorResponse = {
    error: { code, message, supportReference: context.get("requestId"), retryable },
  };
  if (status === 401) context.header("www-authenticate", "Bearer");
  return context.json(payload, status);
}

export default app;
