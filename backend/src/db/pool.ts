import { Pool } from "@neondatabase/serverless";
import type { DatabaseConfig } from "../config.js";
import "./neon.js";

export function createPool(config: DatabaseConfig): Pool {
  return new Pool({
    connectionString: config.url,
    max: config.poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "fleet-api",
  });
}
