import type { PoolClient } from "pg";
import { notFound } from "../domain/errors.js";
import type { FleetSession } from "../domain/session.js";
import { escapeLike } from "../domain/validation.js";
import type { ListResult } from "./vehicles.js";

export interface DriverRecord {
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

export interface DriverInput {
  fullName: string;
  phone?: string | null;
  licenceNumber?: string | null;
  licenceExpiry?: string | null;
  status?: "active" | "inactive";
  notes?: string | null;
}

export interface DriverListQuery {
  limit: number;
  offset: number;
  search?: string;
  status?: "active" | "inactive";
}

const DRIVER_COLUMNS = `
  id,
  full_name AS "fullName",
  phone,
  licence_number AS "licenceNumber",
  licence_expiry AS "licenceExpiry",
  status,
  notes,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export async function createDriver(
  client: PoolClient,
  session: FleetSession,
  input: DriverInput,
): Promise<DriverRecord> {
  const result = await client.query<DriverRecord>(
    `INSERT INTO drivers (
       fleet_id, full_name, phone, licence_number, licence_expiry, status, notes,
       created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     RETURNING ${DRIVER_COLUMNS}`,
    [
      session.membership.fleet.id,
      input.fullName,
      input.phone ?? null,
      input.licenceNumber ?? null,
      input.licenceExpiry ?? null,
      input.status ?? "active",
      input.notes ?? null,
      session.user.id,
    ],
  );
  return result.rows[0] as DriverRecord;
}

export async function listDrivers(
  client: PoolClient,
  fleetId: string,
  query: DriverListQuery,
): Promise<ListResult<DriverRecord>> {
  const search = query.search ? `%${escapeLike(query.search.toLowerCase())}%` : null;
  const filter = `
    fleet_id = $1
    AND (
      $2::text IS NULL
      OR lower(full_name) LIKE $2 ESCAPE '\\'
      OR lower(coalesce(phone, '')) LIKE $2 ESCAPE '\\'
      OR lower(coalesce(licence_number, '')) LIKE $2 ESCAPE '\\'
    )
    AND ($3::driver_status IS NULL OR status = $3::driver_status)
  `;
  const values = [fleetId, search, query.status ?? null];

  const countResult = await client.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM drivers WHERE ${filter}`,
    values,
  );
  const rowsResult = await client.query<DriverRecord>(
    `SELECT ${DRIVER_COLUMNS}
     FROM drivers
     WHERE ${filter}
     ORDER BY full_name ASC, id ASC
     LIMIT $4 OFFSET $5`,
    [...values, query.limit, query.offset],
  );

  return {
    items: rowsResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getDriver(
  client: PoolClient,
  fleetId: string,
  driverId: string,
): Promise<DriverRecord | null> {
  const result = await client.query<DriverRecord>(
    `SELECT ${DRIVER_COLUMNS}
     FROM drivers
     WHERE id = $1 AND fleet_id = $2`,
    [driverId, fleetId],
  );
  return result.rows[0] ?? null;
}

export async function requireDriver(
  client: PoolClient,
  fleetId: string,
  driverId: string,
): Promise<DriverRecord> {
  const driver = await getDriver(client, fleetId, driverId);
  if (!driver) {
    throw notFound("We could not find that driver in your fleet.");
  }
  return driver;
}

export async function updateDriver(
  client: PoolClient,
  session: FleetSession,
  driverId: string,
  input: Partial<DriverInput>,
): Promise<DriverRecord> {
  const values: unknown[] = [];
  const assignments: string[] = [];
  let index = 1;

  const columns: Array<[keyof DriverInput, string]> = [
    ["fullName", "full_name"],
    ["phone", "phone"],
    ["licenceNumber", "licence_number"],
    ["licenceExpiry", "licence_expiry"],
    ["status", "status"],
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
  values.push(driverId, session.membership.fleet.id);

  const result = await client.query<DriverRecord>(
    `UPDATE drivers
     SET ${assignments.join(", ")}
     WHERE id = $${index} AND fleet_id = $${index + 1}
     RETURNING ${DRIVER_COLUMNS}`,
    values,
  );
  const driver = result.rows[0];
  if (!driver) {
    throw notFound("We could not find that driver in your fleet.");
  }
  return driver;
}
