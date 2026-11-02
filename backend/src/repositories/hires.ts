import type { PoolClient } from "@neondatabase/serverless";
import { notFound } from "../domain/errors.js";
import type { FleetSession } from "../domain/session.js";
import type { ListResult } from "./vehicles.js";

export type HireStatus = "planned" | "active" | "completed" | "cancelled";

export interface HireRecord {
  id: string;
  vehicleId: string;
  vehicleRegistration: string | null;
  driverId: string;
  driverName: string | null;
  status: HireStatus;
  startsAt: Date;
  expectedEndAt: Date | null;
  actualEndAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HireInput {
  vehicleId: string;
  driverId: string;
  status: HireStatus;
  startsAt: Date;
  expectedEndAt?: Date | null;
  actualEndAt?: Date | null;
  notes?: string | null;
}

export interface HireListQuery {
  limit: number;
  offset: number;
  status?: HireStatus;
  vehicleId?: string;
  driverId?: string;
}

const HIRE_COLUMNS = `
  h.id,
  h.vehicle_id AS "vehicleId",
  v.registration_number AS "vehicleRegistration",
  h.driver_id AS "driverId",
  d.full_name AS "driverName",
  h.status,
  h.starts_at AS "startsAt",
  h.expected_end_at AS "expectedEndAt",
  h.actual_end_at AS "actualEndAt",
  h.notes,
  h.created_at AS "createdAt",
  h.updated_at AS "updatedAt"
`;

const HIRE_FROM = `
  FROM hires h
  LEFT JOIN vehicles v ON v.id = h.vehicle_id AND v.fleet_id = h.fleet_id
  LEFT JOIN drivers d ON d.id = h.driver_id AND d.fleet_id = h.fleet_id
`;

export async function createHire(
  client: PoolClient,
  session: FleetSession,
  input: HireInput,
): Promise<HireRecord> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO hires (
       fleet_id, vehicle_id, driver_id, status, starts_at, expected_end_at,
       actual_end_at, notes, created_by, updated_by
     ) VALUES ($1, $2, $3, $4::hire_status, $5, $6, $7, $8, $9, $9)
     RETURNING id`,
    [
      session.membership.fleet.id,
      input.vehicleId,
      input.driverId,
      input.status,
      input.startsAt,
      input.expectedEndAt ?? null,
      input.actualEndAt ?? null,
      input.notes ?? null,
      session.user.id,
    ],
  );
  return requireHire(client, session.membership.fleet.id, result.rows[0]!.id);
}

export async function listHires(
  client: PoolClient,
  fleetId: string,
  query: HireListQuery,
): Promise<ListResult<HireRecord>> {
  const filter = `
    h.fleet_id = $1
    AND ($2::hire_status IS NULL OR h.status = $2::hire_status)
    AND ($3::uuid IS NULL OR h.vehicle_id = $3)
    AND ($4::uuid IS NULL OR h.driver_id = $4)
  `;
  const values = [
    fleetId,
    query.status ?? null,
    query.vehicleId ?? null,
    query.driverId ?? null,
  ];

  const countResult = await client.query<{ total: string }>(
    `SELECT count(*)::text AS total ${HIRE_FROM} WHERE ${filter}`,
    values,
  );
  const rowsResult = await client.query<HireRecord>(
    `SELECT ${HIRE_COLUMNS}
     ${HIRE_FROM}
     WHERE ${filter}
     ORDER BY h.starts_at DESC, h.id DESC
     LIMIT $5 OFFSET $6`,
    [...values, query.limit, query.offset],
  );

  return {
    items: rowsResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getHire(
  client: PoolClient,
  fleetId: string,
  hireId: string,
): Promise<HireRecord | null> {
  const result = await client.query<HireRecord>(
    `SELECT ${HIRE_COLUMNS}
     ${HIRE_FROM}
     WHERE h.id = $1 AND h.fleet_id = $2`,
    [hireId, fleetId],
  );
  return result.rows[0] ?? null;
}

export async function requireHire(
  client: PoolClient,
  fleetId: string,
  hireId: string,
): Promise<HireRecord> {
  const hire = await getHire(client, fleetId, hireId);
  if (!hire) {
    throw notFound("We could not find that hire in your fleet.");
  }
  return hire;
}

export async function updateHire(
  client: PoolClient,
  session: FleetSession,
  hireId: string,
  input: Partial<HireInput>,
): Promise<HireRecord> {
  const values: unknown[] = [];
  const assignments: string[] = [];
  let index = 1;

  const columns: Array<[keyof HireInput, string]> = [
    ["vehicleId", "vehicle_id"],
    ["driverId", "driver_id"],
    ["status", "status"],
    ["startsAt", "starts_at"],
    ["expectedEndAt", "expected_end_at"],
    ["actualEndAt", "actual_end_at"],
    ["notes", "notes"],
  ];

  for (const [key, column] of columns) {
    if (input[key] !== undefined) {
      assignments.push(`${column} = $${index}`);
      values.push(input[key]);
      index += 1;
    }
  }

  assignments.push(`updated_by = $${index}`);
  values.push(session.user.id);
  index += 1;
  assignments.push("updated_at = now()");
  values.push(hireId, session.membership.fleet.id);

  const result = await client.query<{ id: string }>(
    `UPDATE hires
     SET ${assignments.join(", ")}
     WHERE id = $${index} AND fleet_id = $${index + 1}
     RETURNING id`,
    values,
  );
  if (!result.rows[0]) {
    throw notFound("We could not find that hire in your fleet.");
  }
  return requireHire(client, session.membership.fleet.id, hireId);
}
