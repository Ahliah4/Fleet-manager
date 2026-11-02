export type IssuedCode = {
  codeHash: string;
  challenge: string;
  subject: string;
  email: string;
  name: string;
  expiresAt: number;
};

export type RefreshToken = {
  tokenHash: string;
  familyId: string;
  subject: string;
  email: string;
  name: string;
  expiresAt: number;
};

export type ConsumedCode = {
  subject: string;
  email: string;
  name: string;
};

export type NextRefreshToken = {
  tokenHash: string;
  expiresAt: number;
};

export type RotateResult =
  | { status: "rotated"; token: RefreshToken }
  | { status: "reused" }
  | { status: "expired" }
  | { status: "missing" };

/**
 * Storage contract for the native mobile PKCE handoff.
 *
 * Implementations store only SHA-256 hashes. Rotation receives the opaque
 * family id separately so a Cloudflare Durable Object can route every member
 * of one refresh-token family to the same serialized object.
 */
export interface MobileFlowStore {
  insertCode(record: IssuedCode): Promise<void>;
  consumeCode(
    codeHash: string,
    challenge: string,
    now: number,
  ): Promise<ConsumedCode | null>;
  insertRefreshToken(record: RefreshToken): Promise<void>;
  rotateRefreshToken(
    currentHash: string,
    familyId: string,
    next: NextRefreshToken,
    now: number,
  ): Promise<RotateResult>;
  revokeRefreshToken(
    tokenHash: string,
    familyId: string,
    now: number,
  ): Promise<void>;
  cleanup(now: number): Promise<void>;
}

/** Local development and test implementation. Never selected in production. */
export function createMemoryMobileFlowStore(): MobileFlowStore {
  const codes = new Map<string, IssuedCode & { usedAt: number | null }>();
  const refreshTokens = new Map<
    string,
    RefreshToken & { revokedAt: number | null; replacedBy: string | null }
  >();

  return {
    async insertCode(record) {
      codes.set(record.codeHash, { ...record, usedAt: null });
    },
    async consumeCode(codeHash, challenge, now) {
      const record = codes.get(codeHash);
      if (
        !record ||
        record.usedAt !== null ||
        record.expiresAt <= now ||
        record.challenge !== challenge
      ) {
        return null;
      }
      record.usedAt = now;
      return {
        subject: record.subject,
        email: record.email,
        name: record.name,
      };
    },
    async insertRefreshToken(record) {
      refreshTokens.set(record.tokenHash, {
        ...record,
        revokedAt: null,
        replacedBy: null,
      });
    },
    async rotateRefreshToken(currentHash, familyId, next, now) {
      const current = refreshTokens.get(currentHash);
      if (!current || current.familyId !== familyId) return { status: "missing" };
      if (current.revokedAt !== null) {
        for (const token of refreshTokens.values()) {
          if (token.familyId === familyId && token.revokedAt === null) {
            token.revokedAt = now;
          }
        }
        return { status: "reused" };
      }
      if (current.expiresAt <= now) {
        current.revokedAt = now;
        return { status: "expired" };
      }

      current.revokedAt = now;
      current.replacedBy = next.tokenHash;
      const replacement: RefreshToken = {
        tokenHash: next.tokenHash,
        familyId,
        subject: current.subject,
        email: current.email,
        name: current.name,
        expiresAt: next.expiresAt,
      };
      refreshTokens.set(next.tokenHash, {
        ...replacement,
        revokedAt: null,
        replacedBy: null,
      });
      return { status: "rotated", token: replacement };
    },
    async revokeRefreshToken(tokenHash, familyId, now) {
      const current = refreshTokens.get(tokenHash);
      if (!current || current.familyId !== familyId) return;
      for (const token of refreshTokens.values()) {
        if (token.familyId === familyId && token.revokedAt === null) {
          token.revokedAt = now;
        }
      }
    },
    async cleanup(now) {
      for (const [key, record] of codes) {
        if (record.expiresAt <= now) codes.delete(key);
      }
      for (const [key, record] of refreshTokens) {
        if (record.expiresAt <= now) refreshTokens.delete(key);
      }
    },
  };
}
