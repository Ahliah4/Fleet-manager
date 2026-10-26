import type { PoolClient } from "pg";
import { notFound } from "../domain/errors.js";
import type { FleetSession } from "../domain/session.js";
import { escapeLike } from "../domain/validation.js";

export interface VehicleRecord {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  colour: string | null;
  notes: string | null;
  insuranceExpiry: string | null;
  roadTaxExpiry: string | null;
  roadworthyExpiry: string | null;
  nextServiceDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VehicleInput {
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  colour?: string | null;
  notes?: string | null;
  insuranceExpiry?: string | null;
  roadTaxExpiry?: string | null;
  roadworthyExpiry?: string | null;
  nextServiceDate?: string | null;
}

export interface VehicleListQuery {
  limit: number;
  offset: number;
  search?: string;
}

export interface ListResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

const VEHICLE_COLUMNS = `
  id,
  registration_number AS "registrationNumber",
  make,
  model,
  year,
  colour,
  notes,
  insurance_expiry AS "insuranceExpiry",
  road_tax_expiry AS "roadTaxExpiry",
  roadworthy_expiry AS "roadworthyExpiry",
  next_service_date AS "nextServiceDate",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export async function createVehicle(
  client: PoolClient,
  session: FleetSession,
  input: VehicleInput,
): Promise<VehicleRecord> {
  const result = await client.query<VehicleRecord>(
    `INSERT INTO vehicles (
       fleet_id, registration_number, make, model, year, colour, notes,
       insurance_expiry, road_tax_expiry, roadworthy_expiry, next_service_date,
       created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
     RETURNING ${VEHICLE_COLUMNS}`,
    [
      session.membership.fleet.id,
      input.registrationNumber,
      input.make,
      input.model,
      input.year,
      input.colour ?? null,
      input.notes ?? null,
      input.insuranceExpiry ?? null,
      input.roadTaxExpiry ?? null,
      input.roadworthyExpiry ?? null,
      input.nextServiceDate ?? null,
      session.user.id,
    ],
  );
  return result.rows[0] as VehicleRecord;
}

export async function listVehicles(
  client: PoolClient,
  fleetId: string,
  query: VehicleListQuery,
): Promise<ListResult<VehicleRecord>> {
  const search = query.search ? `%${escapeLike(query.search.toLowerCase())}%` : null;
  const filter = `
    fleet_id = $1
    AND deleted_at IS NULL
    AND (
      $2::text IS NULL
      OR registration_normalized LIKE $2 ESCAPE '\\'
      OR lower(make) LIKE $2 ESCAPE '\\'
      OR lower(model) LIKE $2 ESCAPE '\\'
    )
  `;
  const values = [fleetId, search];

  const countResult = await client.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM vehicles WHERE ${filter}`,
    values,
  );
  const rowsResult = await client.query<VehicleRecord>(
    `SELECT ${VEHICLE_COLUMNS}
     FROM vehicles
     WHERE ${filter}
     ORDER BY registration_number ASC, id ASC
     LIMIT $3 OFFSET $4`,
    [...values, query.limit, query.offset],
  );

  return {
    items: rowsResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getVehicle(
  client: PoolClient,
  fleetId: string,
  vehicleId: string,
): Promise<VehicleRecord | null> {
  const result = await client.query<VehicleRecord>(
    `SELECT ${VEHICLE_COLUMNS}
     FROM vehicles
     WHERE id = $1 AND fleet_id = $2 AND deleted_at IS NULL`,
    [vehicleId, fleetId],
  );
  return result.rows[0] ?? null;
}

export async function requireVehicle(
  client: PoolClient,
  fleetId: string,
  vehicleId: string,
): Promise<VehicleRecord> {
  const vehicle = await getVehicle(client, fleetId, vehicleId);
  if (!vehicle) {
    throw notFound("We could not find that vehicle in your fleet.");
  }
  return vehicle;
}

export async function updateVehicle(
  client: PoolClient,
  session: FleetSession,
  vehicleId: string,
  input: Partial<VehicleInput>,
): Promise<VehicleRecord> {
  const values: unknown[] = [];
  const assignments: string[] = [];
  let index = 1;

  const columns: Array<[keyof VehicleInput, string]> = [
    ["registrationNumber", "registration_number"],
    ["make", "make"],
    ["model", "model"],
    ["year", "year"],
    ["colour", "colour"],
    ["notes", "notes"],
    ["insuranceExpiry", "insurance_expiry"],
    ["roadTaxExpiry", "road_tax_expiry"],
    ["roadworthyExpiry", "roadworthy_expiry"],
    ["nextServiceDate", "next_service_date"],
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

  values.push(vehicleId, session.membership.fleet.id);

  const result = await client.query<VehicleRecord>(
    `UPDATE vehicles
     SET ${assignments.join(", ")}
     WHERE id = $${index} AND fleet_id = $${index + 1} AND deleted_at IS NULL
     RETURNING ${VEHICLE_COLUMNS}`,
    values,
  );
  const vehicle = result.rows[0];
  if (!vehicle) {
    throw notFound("We could not find that vehicle in your fleet.");
  }
  return vehicle;
}

export async function softDeleteVehicle(
  client: PoolClient,
  session: FleetSession,
  vehicleId: string,
): Promise<VehicleRecord> {
  const result = await client.query<VehicleRecord>(
    `UPDATE vehicles
     SET deleted_at = now(), deleted_by = $3, updated_by = $3, updated_at = now()
     WHERE id = $1 AND fleet_id = $2 AND deleted_at IS NULL
     RETURNING ${VEHICLE_COLUMNS}`,
    [vehicleId, session.membership.fleet.id, session.user.id],
  );
  const vehicle = result.rows[0];
  if (!vehicle) {
    throw notFound("We could not find that vehicle in your fleet.");
  }
  return vehicle;
}

export async function restoreVehicle(
  client: PoolClient,
  session: FleetSession,
  vehicleId: string,
): Promise<VehicleRecord> {
  const result = await client.query<VehicleRecord>(
    `UPDATE vehicles
     SET deleted_at = NULL, deleted_by = NULL, updated_by = $3, updated_at = now()
     WHERE id = $1 AND fleet_id = $2 AND deleted_at IS NOT NULL
     RETURNING ${VEHICLE_COLUMNS}`,
    [vehicleId, session.membership.fleet.id, session.user.id],
  );
  const vehicle = result.rows[0];
  if (!vehicle) {
    throw notFound(
      "We could not find a removed vehicle with that ID. It may already be restored.",
    );
  }
  return vehicle;
}
