import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@neondatabase/serverless";

const migrationName = "0004_membership_invitations.sql";

async function main(): Promise<void> {
  const databaseUrl = process.env.MIGRATION_DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL is required.");
  const target = describeTarget(databaseUrl);
  if (new URL(databaseUrl).hostname.includes("-pooler.")) {
    throw new Error("MIGRATION_DATABASE_URL must use the direct development endpoint.");
  }
  const confirmed = requiredArg("--confirm-target");
  if (confirmed !== target) throw new Error("The confirmed target does not match the connected database.");

  const sql = await readFile(path.resolve(process.cwd(), "migrations", migrationName), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const client = new Client({ connectionString: databaseUrl, application_name: "fleet-migration-reconcile" });
  await client.connect();
  try {
    const checks: Array<[string, string]> = [
      ["type", "SELECT to_regtype('public.fleet_invitation_status') IS NOT NULL AS ok"],
      ["table", "SELECT to_regclass('public.fleet_invitations') IS NOT NULL AS ok"],
      ["function", "SELECT to_regprocedure('app_security.accept_fleet_invitation(uuid)') IS NOT NULL AS ok"],
      ["pending index", "SELECT to_regclass('public.fleet_invitations_fleet_email_pending_idx') IS NOT NULL AS ok"],
      ["status index", "SELECT to_regclass('public.fleet_invitations_fleet_status_idx') IS NOT NULL AS ok"],
      ["updated trigger", `SELECT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'fleet_invitations'
          AND t.tgname = 'fleet_invitations_set_updated_at' AND NOT t.tgisinternal
      ) AS ok`],
      ["row security", `SELECT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'fleet_invitations'
          AND c.relrowsecurity AND c.relforcerowsecurity
      ) AS ok`],
      ["policies", `SELECT (
        SELECT count(*) = 3 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'fleet_invitations'
      ) AS ok`],
      ["app_rw grants", `SELECT has_table_privilege('app_rw', 'public.fleet_invitations', 'SELECT')
        AND has_table_privilege('app_rw', 'public.fleet_invitations', 'INSERT')
        AND has_table_privilege('app_rw', 'public.fleet_invitations', 'UPDATE') AS ok`],
    ];
    const results: Array<{ check_name: string; ok: boolean }> = [];
    for (const [checkName, query] of checks) {
      try {
        const result = await client.query<{ ok: boolean }>(query);
        results.push({ check_name: checkName, ok: result.rows[0]?.ok === true });
      } catch (error) {
        throw new Error(`Check '${checkName}' failed: ${formatError(error)}`);
      }
    }
    const missing = results.filter((row) => !row.ok).map((row) => row.check_name);
    if (missing.length > 0) {
      throw new Error(`0004 is incomplete; refusing to update the migration ledger. Missing: ${missing.join(", ")}`);
    }

    await client.query("BEGIN");
    const existing = await client.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE version = $1",
      [migrationName],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== checksum) throw new Error("The recorded migration checksum does not match the repository.");
      await client.query("COMMIT");
      console.log("Migration 0004 is already recorded as applied.");
      return;
    }
    await client.query(
      `INSERT INTO schema_migrations (version, checksum, execution_ms) VALUES ($1, $2, 0)`,
      [migrationName, checksum],
    );
    await client.query("COMMIT");
    console.log("Verified all 0004 objects and recorded the migration as applied.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function requiredArg(name: string): string {
  const prefix = `${name}=`;
  const inline = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  const index = process.argv.indexOf(name);
  const value = inline ? inline.slice(prefix.length) : index >= 0 ? process.argv[index + 1] : undefined;
  if (!value?.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function describeTarget(value: string): string {
  const url = new URL(value);
  return `${url.hostname}${url.pathname}`;
}

main().catch((error: unknown) => {
  console.error(`Migration reconciliation failed: ${formatError(error)}`);
  process.exitCode = 1;
});

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? ` (${error.code})` : "";
    return `${error.name}${code}: ${redact(error.message)}`;
  }
  if (error && typeof error === "object") {
    const value = error as { type?: unknown; code?: unknown; message?: unknown };
    const parts = [
      typeof value.type === "string" ? value.type : "UnknownError",
      typeof value.code === "string" ? `(${value.code})` : "",
      typeof value.message === "string" ? redact(value.message) : "",
    ].filter(Boolean);
    return parts.join(" ");
  }
  return "UnknownError";
}

function redact(value: string): string {
  return value.replace(/(?:postgres(?:ql)?|wss?):\/\/[^\s"']+/gi, "[database URL redacted]");
}
