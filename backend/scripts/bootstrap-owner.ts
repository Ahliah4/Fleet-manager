import "dotenv/config";
import { Client } from "@neondatabase/serverless";
import "../src/db/neon.js";
import { describeDatabaseTarget } from "../src/config.js";
import {
  BootstrapFailure,
  bootstrapOwner,
  formatSafeError,
  toBootstrapFailure,
} from "../src/bootstrap/owner.js";

/**
 * One-time, development-branch-only bootstrap for the initial Fleet Owner.
 *
 * This command never assigns a role from public signup. It is intentionally a
 * separate operator action and requires an explicit target confirmation.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.MIGRATION_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new BootstrapFailure(
      "configuration",
      "MIGRATION_DATABASE_URL is required. Use the development branch owner/direct connection.",
    );
  }

  const url = parseDatabaseUrl(databaseUrl);
  if (url.hostname.includes("-pooler.")) {
    throw new BootstrapFailure(
      "configuration",
      "MIGRATION_DATABASE_URL must use the direct development endpoint.",
    );
  }

  const email = requiredArg("--email").toLowerCase();
  const subject = requiredArg("--subject");
  const displayName = requiredArg("--display-name");
  const fleetName = requiredArg("--fleet-name");
  const confirmedTarget = requiredArg("--confirm-target");

  // Accept the current host:port/database form and the legacy host/database
  // form so an operator who confirmed the target with an older script is not
  // forced to change the safety check.
  const canonicalTarget = describeDatabaseTarget(databaseUrl);
  const legacyTarget = `${url.hostname}${url.pathname}`;
  if (confirmedTarget !== canonicalTarget && confirmedTarget !== legacyTarget) {
    throw new BootstrapFailure(
      "configuration",
      "The confirmed target does not match the connected database.",
    );
  }

  const client = new Client({
    connectionString: databaseUrl,
    application_name: "fleet-owner-bootstrap",
    connectionTimeoutMillis: 10_000,
  });

  try {
    try {
      await client.connect();
    } catch (error) {
      throw toBootstrapFailure("connect", error);
    }

    const result = await bootstrapOwner(client, {
      subject,
      email,
      displayName,
      fleetName,
    });

    if (result.outcome === "created") {
      console.log(
        "Fleet Owner bootstrap completed for the confirmed development target.",
      );
    } else if (result.outcome === "repaired") {
      console.log(
        "Fleet Owner bootstrap repaired the existing owner setup for the confirmed development target.",
      );
    } else {
      console.log(
        "Fleet Owner bootstrap already complete for the confirmed development target; no changes were needed.",
      );
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

function parseDatabaseUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      throw new Error("wrong protocol");
    }
    return url;
  } catch {
    throw new BootstrapFailure(
      "configuration",
      "MIGRATION_DATABASE_URL must be a valid PostgreSQL URL.",
    );
  }
}

function requiredArg(name: string): string {
  const prefix = `${name}=`;
  const inline = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  const index = process.argv.indexOf(name);
  const value = inline
    ? inline.slice(prefix.length)
    : index >= 0
      ? process.argv[index + 1]
      : undefined;
  if (!value?.trim()) {
    throw new BootstrapFailure("configuration", `${name} is required.`);
  }
  return value.trim();
}

main().catch((error: unknown) => {
  console.error(`Owner bootstrap failed: ${formatSafeError(error)}`);
  process.exitCode = 1;
});
