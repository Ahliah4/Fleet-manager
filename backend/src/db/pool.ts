import { types } from "pg";
import pg from "pg";
import type { DatabaseConfig } from "../config.js";

const { Pool } = pg;

// Keep DATE values as YYYY-MM-DD strings so a server timezone cannot shift them.
types.setTypeParser(types.builtins.DATE, (value) => value);

export function createPool(config: DatabaseConfig): pg.Pool {
  const pool = new Pool({
    connectionString: config.url,
    ssl: config.ssl ? { rejectUnauthorized: true } : undefined,
    max: config.poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "fleet-api",
  });

  return pool;
}
