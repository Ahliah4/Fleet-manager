import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { describeDatabaseTarget } from "../src/config.js";

const { Client } = pg;
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

  const target = describeDatabaseTarget(databaseUrl);
  const ssl = (process.env.DATABASE_SSL ?? "true") === "true";
  const migrations = await readMigrations();

  const client = new Client({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: true } : undefined,
    application_name: "fleet-migrate",
    options: "-c statement_timeout=60000 -c timezone=UTC",
  });

  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await ensureLedger(client);

    const applied = await loadApplied(client);
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
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(
      () => undefined,
    );
    await client.end();
  }
}

async function readMigrations(): Promise<MigrationFile[]> {
  const directory = path.resolve(process.cwd(), "migrations");
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

async function ensureLedger(client: pg.Client): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version text PRIMARY KEY,
       checksum text NOT NULL,
       applied_at timestamptz NOT NULL DEFAULT now(),
       execution_ms integer NOT NULL
     )`,
  );
}

async function loadApplied(client: pg.Client): Promise<AppliedMigration[]> {
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
  console.error(
    `Migration command failed. ${
      error instanceof Error ? error.message : "Unknown error"
    }`,
  );
  process.exitCode = 1;
});
