import { DurableObject } from "cloudflare:workers";

type SqlCursor<T> = Iterable<T> & { toArray(): T[] };
type SqlStorage = {
  exec<T = Record<string, unknown>>(
    query: string,
    ...bindings: Array<string | number | null>
  ): SqlCursor<T>;
};
type DurableStorage = {
  sql: SqlStorage;
  transactionSync<T>(callback: () => T): T;
  setAlarm(timestamp: number): Promise<void>;
};
type DurableContext = { storage: DurableStorage };
type CodeRow = {
  challenge: string;
  subject: string;
  email: string;
  display_name: string;
  expires_at_ms: number;
  used_at_ms: number | null;
};
type RefreshRow = {
  family_id: string;
  subject: string;
  email: string;
  display_name: string;
  expires_at_ms: number;
  revoked_at_ms: number | null;
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function readString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1_024) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function readTime(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

/**
 * One SQLite Durable Object instance stores either one authorization code or
 * one refresh-token family. All refresh rotations for a family are therefore
 * serialized, and the current-token update plus replacement insert commit in
 * one synchronous transaction.
 */
export class MobileAuthFlowStore extends DurableObject {
  private readonly storage: DurableStorage;

  constructor(ctx: unknown, env: unknown) {
    super(ctx, env);
    this.storage = (ctx as DurableContext).storage;
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS auth_codes (
        code_hash TEXT PRIMARY KEY,
        challenge TEXT NOT NULL,
        subject TEXT NOT NULL,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        used_at_ms INTEGER
      );
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_hash TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        revoked_at_ms INTEGER,
        replaced_by_hash TEXT
      );
      CREATE INDEX IF NOT EXISTS refresh_family_idx
        ON refresh_tokens (family_id);
    `);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "not_found" }, 404);

    let input: Record<string, unknown>;
    try {
      input = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    try {
      switch (new URL(request.url).pathname) {
        case "/code/insert":
          return await this.insertCode(input);
        case "/code/consume":
          return this.consumeCode(input);
        case "/refresh/insert":
          return await this.insertRefresh(input);
        case "/refresh/rotate":
          return this.rotateRefresh(input);
        case "/refresh/revoke":
          return this.revokeRefresh(input);
        case "/cleanup":
          return this.cleanup(readTime(input.now, "time"));
        default:
          return json({ error: "not_found" }, 404);
      }
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.cleanupRows(now);
    const remaining = this.storage.sql
      .exec<{ expires_at_ms: number }>(`
        SELECT expires_at_ms FROM auth_codes
        UNION ALL
        SELECT expires_at_ms FROM refresh_tokens
        ORDER BY expires_at_ms DESC LIMIT 1
      `)
      .toArray()[0];
    if (remaining) {
      await this.storage.setAlarm(Math.max(now + 60_000, remaining.expires_at_ms));
    }
  }

  private async insertCode(input: Record<string, unknown>): Promise<Response> {
    const expiresAt = readTime(input.expiresAt, "expiry");
    this.storage.sql.exec(
      `INSERT INTO auth_codes
       (code_hash, challenge, subject, email, display_name, expires_at_ms, used_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      readString(input.codeHash, "code hash"),
      readString(input.challenge, "challenge"),
      readString(input.subject, "subject"),
      readString(input.email, "email"),
      readString(input.name, "display name"),
      expiresAt,
    );
    await this.storage.setAlarm(expiresAt);
    return json({ ok: true });
  }

  private consumeCode(input: Record<string, unknown>): Response {
    const codeHash = readString(input.codeHash, "code hash");
    const challenge = readString(input.challenge, "challenge");
    const now = readTime(input.now, "time");
    const consumed = this.storage.transactionSync(() => {
      const row = this.storage.sql
        .exec<CodeRow>(
          `SELECT challenge, subject, email, display_name, expires_at_ms, used_at_ms
           FROM auth_codes WHERE code_hash = ? LIMIT 1`,
          codeHash,
        )
        .toArray()[0];
      if (
        !row ||
        row.used_at_ms !== null ||
        row.expires_at_ms <= now ||
        row.challenge !== challenge
      ) {
        return null;
      }
      this.storage.sql.exec(
        `UPDATE auth_codes SET used_at_ms = ?
         WHERE code_hash = ? AND used_at_ms IS NULL`,
        now,
        codeHash,
      );
      return { subject: row.subject, email: row.email, name: row.display_name };
    });
    return json(consumed);
  }

  private async insertRefresh(input: Record<string, unknown>): Promise<Response> {
    const expiresAt = readTime(input.expiresAt, "expiry");
    this.storage.sql.exec(
      `INSERT INTO refresh_tokens
       (token_hash, family_id, subject, email, display_name, expires_at_ms,
        revoked_at_ms, replaced_by_hash)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
      readString(input.tokenHash, "token hash"),
      readString(input.familyId, "family"),
      readString(input.subject, "subject"),
      readString(input.email, "email"),
      readString(input.name, "display name"),
      expiresAt,
    );
    await this.storage.setAlarm(expiresAt);
    return json({ ok: true });
  }

  private rotateRefresh(input: Record<string, unknown>): Response {
    const currentHash = readString(input.currentHash, "token hash");
    const familyId = readString(input.familyId, "family");
    const nextHash = readString(input.nextHash, "replacement hash");
    const nextExpiresAt = readTime(input.nextExpiresAt, "expiry");
    const now = readTime(input.now, "time");

    const result = this.storage.transactionSync(() => {
      const current = this.storage.sql
        .exec<RefreshRow>(
          `SELECT family_id, subject, email, display_name, expires_at_ms,
                  revoked_at_ms
           FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
          currentHash,
        )
        .toArray()[0];
      if (!current || current.family_id !== familyId) return { status: "missing" };
      if (current.revoked_at_ms !== null) {
        this.storage.sql.exec(
          `UPDATE refresh_tokens SET revoked_at_ms = ?
           WHERE family_id = ? AND revoked_at_ms IS NULL`,
          now,
          familyId,
        );
        return { status: "reused" };
      }
      if (current.expires_at_ms <= now) {
        this.storage.sql.exec(
          `UPDATE refresh_tokens SET revoked_at_ms = ?
           WHERE token_hash = ? AND revoked_at_ms IS NULL`,
          now,
          currentHash,
        );
        return { status: "expired" };
      }

      this.storage.sql.exec(
        `UPDATE refresh_tokens
         SET revoked_at_ms = ?, replaced_by_hash = ?
         WHERE token_hash = ? AND revoked_at_ms IS NULL`,
        now,
        nextHash,
        currentHash,
      );
      this.storage.sql.exec(
        `INSERT INTO refresh_tokens
         (token_hash, family_id, subject, email, display_name, expires_at_ms,
          revoked_at_ms, replaced_by_hash)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
        nextHash,
        familyId,
        current.subject,
        current.email,
        current.display_name,
        nextExpiresAt,
      );
      return {
        status: "rotated",
        token: {
          tokenHash: nextHash,
          familyId,
          subject: current.subject,
          email: current.email,
          name: current.display_name,
          expiresAt: nextExpiresAt,
        },
      };
    });
    return json(result);
  }

  private revokeRefresh(input: Record<string, unknown>): Response {
    const tokenHash = readString(input.tokenHash, "token hash");
    const familyId = readString(input.familyId, "family");
    const now = readTime(input.now, "time");
    this.storage.transactionSync(() => {
      const current = this.storage.sql
        .exec<{ family_id: string }>(
          `SELECT family_id FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
          tokenHash,
        )
        .toArray()[0];
      if (!current || current.family_id !== familyId) return;
      this.storage.sql.exec(
        `UPDATE refresh_tokens SET revoked_at_ms = ?
         WHERE family_id = ? AND revoked_at_ms IS NULL`,
        now,
        familyId,
      );
    });
    return json({ ok: true });
  }

  private cleanup(now: number): Response {
    this.cleanupRows(now);
    return json({ ok: true });
  }

  private cleanupRows(now: number): void {
    this.storage.transactionSync(() => {
      this.storage.sql.exec(`DELETE FROM auth_codes WHERE expires_at_ms <= ?`, now);
      this.storage.sql.exec(
        `DELETE FROM refresh_tokens
         WHERE expires_at_ms <= ?
            OR (revoked_at_ms IS NOT NULL AND revoked_at_ms <= ?)`,
        now,
        now - 30 * 24 * 60 * 60 * 1000,
      );
    });
  }
}
