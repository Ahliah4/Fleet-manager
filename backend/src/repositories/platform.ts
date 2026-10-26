import type { PoolClient } from "pg";
import type { ListResult } from "./vehicles.js";

export interface PlatformFleetRecord {
  id: string;
  name: string;
  status: "pending" | "active" | "suspended" | "closed";
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformFleetListQuery {
  limit: number;
  offset: number;
}

export async function listPlatformFleets(
  client: PoolClient,
  query: PlatformFleetListQuery,
): Promise<ListResult<PlatformFleetRecord>> {
  const countResult = await client.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM fleets`,
  );
  const rowsResult = await client.query<PlatformFleetRecord>(
    `SELECT
       id,
       name,
       status,
       timezone,
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM fleets
     ORDER BY name ASC, id ASC
     LIMIT $1 OFFSET $2`,
    [query.limit, query.offset],
  );

  return {
    items: rowsResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
    limit: query.limit,
    offset: query.offset,
  };
}

export async function platformFleetExists(
  client: PoolClient,
  fleetId: string,
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM fleets WHERE id = $1) AS exists`,
    [fleetId],
  );
  return result.rows[0]?.exists === true;
}
