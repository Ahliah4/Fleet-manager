import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/database.js";

export function registerHealthRoutes(
  app: FastifyInstance,
  dependencies: { config: AppConfig; database: Database },
): void {
  app.get("/healthz", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    return {
      status: "ok",
      service: "fleet-api",
    };
  });

  app.get("/readyz", async (_request, reply) => {
    reply.header("cache-control", "no-store");

    let databaseOk = false;
    try {
      await dependencies.database.ping();
      databaseOk = await dependencies.database.schemaReady();
    } catch {
      databaseOk = false;
    }

    const authOk = dependencies.config.auth !== null;
    const ready = databaseOk && authOk;

    reply.code(ready ? 200 : 503);
    return {
      status: ready ? "ok" : "unavailable",
      service: "fleet-api",
      checks: {
        database: databaseOk ? "ok" : "unavailable",
        schema: databaseOk ? "ok" : "unavailable",
        auth: authOk ? "configured" : "not_configured",
      },
    };
  });
}
