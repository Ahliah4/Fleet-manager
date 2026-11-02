import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@neondatabase/serverless";
import { describeDatabaseTarget } from "../src/config.js";
import "../src/db/neon.js";

const MIGRATION_LOCK_ID = 7_364_920_1;

interface MigrationFile {
  version: string;
  sql: string;
  checksum: string;
}

interface AppliedMigration {
  version: string;
  checksum: string;
  applied_at: Date;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const help = args.has("--help") || args.has("-h");

  if (help) {
    printHelp();
    return;
  }

  const unknown = [...args].filter(
    (arg) =>
      !arg.startsWith("--confirm-target=") &&
      !["--apply", "--status", "--help", "-h"].includes(arg),
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  }

  const databaseUrl = process.env.MIGRATION_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "MIGRATION_DATABASE_URL is required. Use the development branch owner/direct connection. The API's DATABASE_URL is not used for migrations.",
    );
  }
  assertDirectMigrationEndpoint(databaseUrl);

  const target = describeDatabaseTarget(databaseUrl);
  const migrations = await readMigrations();

  // Migrations need one long-lived WebSocket session: session-level advisory
  // locks and interactive BEGIN/COMMIT blocks are not available over Neon's
  // one-shot HTTP SQL interface.
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "fleet-migrate",
    connectionTimeoutMillis: 10_000,
  });

  let connected = false;
  try {
    await client.connect();
    connected = true;

    // The WebSocket proxy does not accept pg's `options` startup parameter, so
    // session settings are applied once on the open connection.
    await client.query("SET statement_timeout = 60000");
    await client.query("SET TIME ZONE 'UTC'");

    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);

    // Status is read-only: never create the ledger just to report progress.
    // Applying creates it only after --confirm-target matches.
    const ledgerExists = await migrationLedgerExists(client);
    const applied = ledgerExists ? await loadApplied(client) : [];
    const appliedByVersion = new Map(applied.map((row) => [row.version, row]));

    for (const migration of migrations) {
      const existing = appliedByVersion.get(migration.version);
      if (existing && existing.checksum !== migration.checksum) {
        throw new Error(
          `Migration ${migration.version} was changed after it was applied. Create a new forward migration instead.`,
        );
      }
    }

    console.log(`Target: ${target}`);
    console.log(`Migrations: ${migrations.length} file(s)`);
    for (const migration of migrations) {
      const existing = appliedByVersion.get(migration.version);
      const state = existing
        ? `applied ${existing.applied_at.toISOString()}`
        : "pending";
      console.log(`  ${state.padEnd(40)} ${migration.version}`);
    }

    if (!apply) {
      if (!ledgerExists) {
        console.log(
          "Ledger: not created yet. Every migration is pending; --apply creates it.",
        );
      }
      console.log("No changes applied. Re-run with --apply to apply pending migrations.");
      return;
    }

    const confirmTarget = getArgValue(process.argv.slice(2), "--confirm-target");
    if (!confirmTarget) {
      throw new Error(
        `Refusing to apply migrations without --confirm-target=${JSON.stringify(target)}.`,
      );
    }
    if (confirmTarget !== target) {
      throw new Error(
        `Refusing to apply migrations: --confirm-target did not match the connected database.`,
      );
    }

    if (!ledgerExists) {
      await ensureLedger(client);
    }

    for (const migration of migrations) {
      if (appliedByVersion.has(migration.version)) {
        continue;
      }
      const started = Date.now();
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO schema_migrations (version, checksum, execution_ms)
           VALUES ($1, $2, $3)`,
          [migration.version, migration.checksum, Date.now() - started],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw new Error(
          `Migration ${migration.version} failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
          { cause: error },
        );
      }
      console.log(
        `Applied ${migration.version} in ${Date.now() - started} ms`,
      );
    }
    console.log("Migrations complete.");
  } finally {
    if (connected) {
      await client
        .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID])
        .catch(() => undefined);
    }
    await client.end().catch(() => undefined);
  }
}

function assertDirectMigrationEndpoint(databaseUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    // The connection layer reports an invalid URL without echoing it.
    return;
  }
  if (hostname.includes("-pooler.")) {
    throw new Error(
      "MIGRATION_DATABASE_URL must use the direct (unpooled) Neon endpoint. Session advisory locks are not safe through a transaction pooler.",
    );
  }
}

async function readMigrations(): Promise<MigrationFile[]> {  const directory = path.resolve(process.cwd(), "migrations");
  const files = (await readdir(directory))
    .filter((file) => /^\d+_[a-z0-9_]+\.sql$/i.test(file))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    files.map(async (version) => {
      const sql = await readFile(path.join(directory, version), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      return { version, sql, checksum };
    }),
  );
}

async function ensureLedger(client: Client): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version text PRIMARY KEY,
       checksum text NOT NULL,
       applied_at timestamptz NOT NULL DEFAULT now(),
       execution_ms integer NOT NULL
     )`,
  );
}

async function migrationLedgerExists(client: Client): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present`,
  );
  return result.rows[0]?.present === true;
}

async function loadApplied(client: Client): Promise<AppliedMigration[]> {
  const result = await client.query<AppliedMigration>(
    `SELECT version, checksum, applied_at
     FROM schema_migrations
     ORDER BY version`,
  );
  return result.rows;
}

function getArgValue(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = args.indexOf(name);
  if (index >= 0) {
    return args[index + 1];
  }
  return undefined;
}

function printHelp(): void {
  console.log(`Usage: npm run migrate -- [--status] [--apply --confirm-target=<host/database>]

MIGRATION_DATABASE_URL must point at the development branch owner/direct connection.
The API's DATABASE_URL is never used by this command.

Without --apply, the command only prints applied and pending migrations.
--apply requires --confirm-target to match the connected host and database exactly.`);
}

main().catch((error: unknown) => {
  console.error(`Migration command failed: ${formatSafeError(error)}`);
  process.exitCode = 1;
});

function formatSafeError(error: unknown): string {
  if (!(error instanceof Error)) {
    // WebSocket failures can surface as DOM-style events rather than Errors.
    if (typeof error === "string") {
      return redactSecrets(error);
    }
    if (error && typeof error === "object") {
      const event = error as {
        type?: unknown;
        message?: unknown;
        code?: unknown;
        error?: unknown;
      };
      const parts: string[] = [];
      if (typeof event.type === "string" && event.type) {
        parts.push(event.type);
      }
      if (typeof event.code === "string" && event.code) {
        parts.push(`code=${event.code}`);
      }
      if (typeof event.message === "string" && event.message) {
        parts.push(redactSecrets(event.message));
      }
      if (event.error instanceof Error) {
        parts.push(redactSecrets(event.error.message));
      }
      return parts.join(" | ") || "Unknown connection error.";
    }
    return "Unknown error.";
  }

  const parts = [error.name];
  const code = "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
  if (code) {
    parts.push(`code=${code}`);
  }

  const message = redactSecrets(error.message.trim());
  if (message) {
    parts.push(message);
  } else {
    parts.push("No error message was provided.");
  }

  if (error.cause instanceof Error) {
    const causeCode = "code" in error.cause && typeof error.cause.code === "string"
      ? error.cause.code
      : undefined;
    parts.push(
      `cause=${redactSecrets(
        `${causeCode ? `${causeCode}: ` : ""}${error.cause.message || error.cause.name}`,
      )}`,
    );
  }

  return parts.join(" | ");
}

function redactSecrets(value: string): string {
  return value.replace(
    /(?:postgres(?:ql)?|wss?):\/\/[^\s"']+/gi,
    "[database URL redacted]",
  );
}
