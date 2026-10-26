import "dotenv/config";
import { loadConfig, describeDatabaseTarget, ConfigurationError } from "./config.js";
import { buildApp } from "./app.js";
import { PostgresDatabase } from "./db/database.js";

async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof buildApp>> | null = null;
  let database: PostgresDatabase | null = null;

  try {
    const config = loadConfig();
    database = new PostgresDatabase(config.database);
    app = await buildApp({ config, database });

    app.addHook("onClose", async () => {
      await database?.close();
    });

    database.onPoolError((error) => {
      app?.log.error({ err: error }, "Idle database client error");
    });

    await database.assertSafeRole();

    if (!config.auth) {
      app.log.warn(
        "Authentication is not configured. Protected /v1 routes will return 503 until AUTH_* is set.",
      );
    }

    await app.listen({ host: config.host, port: config.port });
    app.log.info(
      {
        database: describeDatabaseTarget(config.database.url),
        expectedRole: config.database.expectedRole,
        authConfigured: config.auth !== null,
        nodeEnv: config.nodeEnv,
      },
      "Fleet API listening",
    );

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      app?.log.info({ signal }, "Shutting down");
      try {
        await app?.close();
        process.exit(0);
      } catch (error) {
        app?.log.error({ err: error }, "Shutdown failed");
        process.exit(1);
      }
    };

    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });
  } catch (error) {
    if (app) {
      app.log.fatal({ err: error }, "Fleet API failed to start");
      await app.close().catch(() => undefined);
    } else {
      await database?.close().catch(() => undefined);
      const message =
        error instanceof ConfigurationError
          ? error.message
          : error instanceof Error
            ? `${error.name}: ${error.message}`
            : "Unknown startup error";
      console.error(`Fleet API failed to start. ${message}`);
    }
    process.exitCode = 1;
  }
}

void main();
