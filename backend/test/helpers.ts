import type { PoolClient } from "@neondatabase/serverless";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db/database.js";
import {
  DEFAULT_FLEET_POLICY,
  permissionsForRole,
  type FleetPolicy,
  type FleetRole,
} from "../src/domain/permissions.js";
import type { FleetSession, Session } from "../src/domain/session.js";
import type { VehicleRecord } from "../src/repositories/vehicles.js";

export const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const FLEET_ID = "11111111-1111-4111-8111-111111111111";
export const MEMBERSHIP_ID = "33333333-3333-4333-8333-333333333333";
export const VEHICLE_ID = "a0000001-0000-4000-8000-000000000001";

export function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    logLevel: "silent",
    database: {
      url: "postgresql://app_rw:test@localhost:5432/fleet_test",
      poolMax: 2,
      expectedRole: "app_rw",
    },
    auth: null,
    trustProxy: false,
    ...overrides,
  };
}

export function makeSession(
  role: FleetRole,
  options: { policy?: Partial<FleetPolicy>; platformAdmin?: boolean } = {},
): FleetSession & { platformAdmin: boolean } {
  const policy: FleetPolicy = { ...DEFAULT_FLEET_POLICY, ...options.policy };
  return {
    user: { id: USER_ID, displayName: "Test User" },
    membership: {
      id: MEMBERSHIP_ID,
      role,
      permissions: permissionsForRole(role),
      fleet: {
        id: FLEET_ID,
        name: "Test Fleet",
        status: "active",
        policy,
      },
    },
    platformAdmin: options.platformAdmin ?? false,
  };
}

export function makePlatformSession(): Session {
  return {
    user: { id: USER_ID, displayName: "Platform User" },
    membership: null,
    platformAdmin: true,
  };
}

export function makeVehicle(overrides: Partial<VehicleRecord> = {}): VehicleRecord {
  return {
    id: VEHICLE_ID,
    registrationNumber: "AAA 111",
    make: "Toyota",
    model: "Corolla",
    year: 2020,
    colour: "White",
    notes: "Private fleet note",
    insuranceExpiry: "2027-01-01",
    roadTaxExpiry: "2027-02-01",
    roadworthyExpiry: "2027-03-01",
    nextServiceDate: "2027-04-01",
    createdAt: new Date("2026-10-26T10:00:00.000Z"),
    updatedAt: new Date("2026-10-26T10:00:00.000Z"),
    ...overrides,
  };
}

export interface FakeQueryResult {
  rows: unknown[];
  rowCount: number;
}

export type QueryHandler = (
  sql: string,
  params?: unknown[],
) => Promise<FakeQueryResult>;

export class FakeDatabase implements Database {
  session: Session | null = null;
  queryHandler: QueryHandler = async () => ({ rows: [], rowCount: 0 });
  withFleetError: Error | null = null;
  schemaReadyResult = true;
  fleetCalls = 0;
  userCalls = 0;
  platformCalls = 0;

  async ping(): Promise<void> {}

  async schemaReady(): Promise<boolean> {
    return this.schemaReadyResult;
  }

  async assertSafeRole(): Promise<void> {}

  async resolveSession(): Promise<Session | null> {
    return this.session;
  }

  async withFleet<T>(
    _session: FleetSession,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    this.fleetCalls += 1;
    if (this.withFleetError) {
      throw this.withFleetError;
    }
    return work(this.client);
  }

  async withUser<T>(
    _session: Session,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    this.userCalls += 1;
    return work(this.client);
  }

  async withPlatform<T>(
    _session: Session,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    this.platformCalls += 1;
    return work(this.client);
  }

  async close(): Promise<void> {}

  private get client(): PoolClient {
    return {
      query: async (...args: unknown[]) => {
        const sql = String(args[0]);
        const params = Array.isArray(args[1]) ? (args[1] as unknown[]) : undefined;
        return this.queryHandler(sql, params);
      },
    } as unknown as PoolClient;
  }
}
