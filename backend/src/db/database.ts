import type { Pool, PoolClient } from "@neondatabase/serverless";
import { createPool } from "./pool.js";
import { membershipConflict, permissionDenied } from "../domain/errors.js";
import {
  isFleetRole,
  normalizeFleetPolicy,
  permissionsForRole,
} from "../domain/permissions.js";
import type {
  FleetSession,
  Session,
  SessionFleet,
  SessionMembership,
} from "../domain/session.js";
import type { DatabaseConfig } from "../config.js";
import {
  setFleetContext,
  setLocal,
  setPlatformContext,
  setUserContext,
  withTransaction,
} from "./context.js";

export interface Database {
  ping(): Promise<void>;
  schemaReady(): Promise<boolean>;
  assertSafeRole(): Promise<void>;
  resolveSession(subject: string): Promise<Session | null>;
  withUser<T>(session: Session, work: (client: PoolClient) => Promise<T>): Promise<T>;
  withFleet<T>(session: FleetSession, work: (client: PoolClient) => Promise<T>): Promise<T>;
  withPlatform<T>(session: Session, work: (client: PoolClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

interface UserRow {
  id: string;
  display_name: string;
  status: string;
}

interface MembershipRow {
  id: string;
  fleet_id: string;
  role: string;
  status: string;
}

interface FleetRow {
  id: string;
  name: string;
  status: string;
  policy: unknown;
}

const FLEET_STATUSES = ["pending", "active", "suspended", "closed"] as const;

export class PostgresDatabase implements Database {
  private readonly pool: Pool;

  constructor(private readonly config: DatabaseConfig) {
    this.pool = createPool(config);
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async schemaReady(): Promise<boolean> {
    const result = await this.pool.query<{ ready: boolean }>(
      `SELECT
         to_regclass('public.schema_migrations') IS NOT NULL
         AND to_regclass('public.fleets') IS NOT NULL
         AND to_regclass('public.vehicles') IS NOT NULL
         AND to_regclass('public.audit_events') IS NOT NULL
         AS ready`,
    );
    return result.rows[0]?.ready === true;
  }

  async assertSafeRole(): Promise<void> {
    const result = await this.pool.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolinherit: boolean;
    }>(
      `SELECT current_user, r.rolsuper, r.rolbypassrls, r.rolcreatedb,
              r.rolcreaterole, r.rolinherit
       FROM pg_roles r
       WHERE r.rolname = current_user`,
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Could not verify the database role.");
    }
    if (row.current_user !== this.config.expectedRole) {
      throw new Error(
        `The API must connect as ${this.config.expectedRole}, not ${row.current_user}.`,
      );
    }
    if (
      row.rolsuper ||
      row.rolbypassrls ||
      row.rolcreatedb ||
      row.rolcreaterole ||
      row.rolinherit
    ) {
      throw new Error(
        "The API database role must not be a superuser or have BYPASSRLS, CREATEDB, CREATEROLE, or INHERIT.",
      );
    }
  }

  async resolveSession(subject: string): Promise<Session | null> {
    return withTransaction(this.pool, async (client) => {
      await setLocal(client, "app.idp_subject", subject);

      const userResult = await client.query<UserRow>(
        `SELECT id, display_name, status
         FROM users
         WHERE idp_subject = $1`,
        [subject],
      );
      const user = userResult.rows[0];
      if (!user || user.status !== "active") {
        return null;
      }

      await setLocal(client, "app.user_id", user.id);

      const membershipResult = await client.query<MembershipRow>(
        `SELECT id, fleet_id, role, status
         FROM fleet_memberships
         WHERE user_id = $1 AND status = 'active'`,
        [user.id],
      );

      if (membershipResult.rows.length > 1) {
        throw membershipConflict();
      }

      const platformAdmin = await this.isPlatformAdmin(client);
      const membershipRow = membershipResult.rows[0];

      if (!membershipRow) {
        return {
          user: { id: user.id, displayName: user.display_name },
          membership: null,
          platformAdmin,
        };
      }

      if (!isFleetRole(membershipRow.role)) {
        throw membershipConflict();
      }

      const permissions = permissionsForRole(membershipRow.role);
      await setLocal(client, "app.fleet_id", membershipRow.fleet_id);
      await setLocal(client, "app.role", membershipRow.role);
      await setLocal(client, "app.permissions", permissions.join(","));

      const fleetResult = await client.query<FleetRow>(
        `SELECT id, name, status, policy FROM fleets WHERE id = $1`,
        [membershipRow.fleet_id],
      );
      const fleetRow = fleetResult.rows[0];
      if (!fleetRow) {
        throw membershipConflict();
      }
      if (!isFleetStatus(fleetRow.status)) {
        throw membershipConflict();
      }

      const fleet: SessionFleet = {
        id: fleetRow.id,
        name: fleetRow.name,
        status: fleetRow.status,
        policy: normalizeFleetPolicy(fleetRow.policy),
      };
      const membership: SessionMembership = {
        id: membershipRow.id,
        role: membershipRow.role,
        fleet,
        permissions,
      };

      return {
        user: { id: user.id, displayName: user.display_name },
        membership,
        platformAdmin,
      };
    });
  }

  async withFleet<T>(
    session: FleetSession,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, async (client) => {
      await setFleetContext(client, session);
      return work(client);
    });
  }

  async withUser<T>(
    session: Session,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, async (client) => {
      await setUserContext(client, session);
      return work(client);
    });
  }

  async withPlatform<T>(
    session: Session,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, async (client) => {
      await setPlatformContext(client, session);
      if (!(await this.isPlatformAdmin(client))) {
        throw permissionDenied(
          "This area is for platform administrators. Fleet roles cannot access it.",
        );
      }
      return work(client);
    });
  }

  onPoolError(handler: (error: Error) => void): void {
    this.pool.on("error", handler);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async isPlatformAdmin(client: PoolClient): Promise<boolean> {
    const result = await client.query<{ is_admin: boolean }>(
      `SELECT app_security.is_platform_admin() AS is_admin`,
    );
    return result.rows[0]?.is_admin === true;
  }
}

function isFleetStatus(value: string): value is SessionFleet["status"] {
  return (FLEET_STATUSES as readonly string[]).includes(value);
}
