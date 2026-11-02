import { createHash, randomBytes } from "node:crypto";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  jwtVerify,
} from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertMobileFlowStorageConfigured,
  exchangeCode,
  issueCode,
  mintAccessToken,
  publicJwks,
  revokeRefreshToken,
  rotateRefreshToken,
  setMobileFlowStoreForTests,
} from "../lib/mobile-flow";
import { createMemoryMobileFlowStore } from "../lib/mobile-store";

const issuer = "https://gateway.test";
const audience = "https://api.test";
let verifyKey: ReturnType<typeof createLocalJWKSet>;

function verifier(): string {
  return randomBytes(32).toString("base64url");
}

function challengeFor(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

async function signIn() {
  const codeVerifier = verifier();
  const code = await issueCode({
    challenge: challengeFor(codeVerifier),
    subject: "user-1",
    email: "owner@example.test",
    name: "Fleet Owner",
  });
  return exchangeCode({ code, verifier: codeVerifier });
}

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
    extractable: true,
  });
  const privateJwk = {
    ...(await exportJWK(privateKey)),
    kid: "fleet-gateway-1",
    use: "sig",
    alg: "EdDSA",
  };
  const publicJwk = {
    ...(await exportJWK(publicKey)),
    kid: "fleet-gateway-1",
    use: "sig",
    alg: "EdDSA",
  };
  process.env.NEON_AUTH_COOKIE_SECRET = randomBytes(48).toString("base64url");
  process.env.GATEWAY_JWT_ISSUER = issuer;
  process.env.GATEWAY_JWT_AUDIENCE = audience;
  process.env.GATEWAY_JWT_PRIVATE_JWK = JSON.stringify(privateJwk);
  process.env.GATEWAY_JWT_PUBLIC_JWK = JSON.stringify(publicJwk);
  process.env.MOBILE_FLOW_STORAGE = "memory";
  verifyKey = createLocalJWKSet(await publicJwks());
});

function setNodeEnv(value: string): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

beforeEach(() => {
  vi.useRealTimers();
  setNodeEnv("test");
  process.env.MOBILE_FLOW_STORAGE = "memory";
  delete process.env.MOBILE_AUTH_DATABASE_URL;
  setMobileFlowStoreForTests(createMemoryMobileFlowStore());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("mobile PKCE flow", () => {
  it("exchanges a single-use code for an access and refresh token", async () => {
    const result = await signIn();
    expect(result.expiresIn).toBe(600);
    expect(result.refreshToken.length).toBeGreaterThan(20);

    const { payload } = await jwtVerify(result.accessToken, verifyKey, {
      issuer,
      audience,
    });
    expect(payload.sub).toBe("user-1");
  });

  it("rejects a reused authorization code", async () => {
    const codeVerifier = verifier();
    const code = await issueCode({
      challenge: challengeFor(codeVerifier),
      subject: "user-1",
      email: "owner@example.test",
      name: "Fleet Owner",
    });

    await exchangeCode({ code, verifier: codeVerifier });
    await expect(exchangeCode({ code, verifier: codeVerifier })).rejects.toThrow(
      "invalid or expired",
    );
  });

  it("does not consume a code when the PKCE verifier is wrong", async () => {
    const codeVerifier = verifier();
    const code = await issueCode({
      challenge: challengeFor(codeVerifier),
      subject: "user-1",
      email: "owner@example.test",
      name: "Fleet Owner",
    });

    await expect(
      exchangeCode({ code, verifier: verifier() }),
    ).rejects.toThrow("invalid or expired");
    await expect(exchangeCode({ code, verifier: codeVerifier })).resolves.toBeTruthy();
  });

  it("rotates a refresh token exactly once", async () => {
    const session = await signIn();
    const rotated = await rotateRefreshToken(session.refreshToken);
    expect(rotated.refreshToken).not.toBe(session.refreshToken);
    await expect(rotateRefreshToken(rotated.refreshToken)).resolves.toBeTruthy();
  });

  it("revokes the whole family when a rotated refresh token is replayed", async () => {
    const session = await signIn();
    const rotated = await rotateRefreshToken(session.refreshToken);
    await expect(rotateRefreshToken(session.refreshToken)).rejects.toThrow(
      "no longer valid",
    );
    await expect(rotateRefreshToken(rotated.refreshToken)).rejects.toThrow(
      "no longer valid",
    );
  });

  it("revokes the family on sign-out", async () => {
    const session = await signIn();
    await revokeRefreshToken(session.refreshToken);
    await expect(rotateRefreshToken(session.refreshToken)).rejects.toThrow(
      "no longer valid",
    );
  });

  it("rejects an expired authorization code", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const codeVerifier = verifier();
    const code = await issueCode({
      challenge: challengeFor(codeVerifier),
      subject: "user-1",
      email: "owner@example.test",
      name: "Fleet Owner",
    });
    vi.setSystemTime(new Date("2026-01-01T00:02:00.000Z"));
    await expect(exchangeCode({ code, verifier: codeVerifier })).rejects.toThrow(
      "invalid or expired",
    );
  });

  it("rejects an expired refresh session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const session = await signIn();
    vi.setSystemTime(new Date("2026-02-15T00:00:00.000Z"));
    await expect(rotateRefreshToken(session.refreshToken)).rejects.toThrow(
      "expired",
    );
  });

  it("allows only one concurrent exchange of the same code", async () => {
    const codeVerifier = verifier();
    const code = await issueCode({
      challenge: challengeFor(codeVerifier),
      subject: "user-1",
      email: "owner@example.test",
      name: "Fleet Owner",
    });
    const results = await Promise.allSettled([
      exchangeCode({ code, verifier: codeVerifier }),
      exchangeCode({ code, verifier: codeVerifier }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("rotates one winner and revokes the family on concurrent refresh", async () => {
    const session = await signIn();
    const results = await Promise.allSettled([
      rotateRefreshToken(session.refreshToken),
      rotateRefreshToken(session.refreshToken),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(rotateRefreshToken(session.refreshToken)).rejects.toThrow(
      "no longer valid",
    );
  });

  it("fails closed in production without durable storage", () => {
    expect(() => assertMobileFlowStorageConfigured("production", "memory")).toThrow(
      "storage is not configured",
    );

    expect(() =>
      assertMobileFlowStorageConfigured("production", "durable-object"),
    ).not.toThrow();
  });

  it("mints short-lived EdDSA access tokens", async () => {
    const token = await mintAccessToken("user-2");
    const { payload, protectedHeader } = await jwtVerify(token, verifyKey, {
      issuer,
      audience,
    });
    expect(protectedHeader.alg).toBe("EdDSA");
    expect(payload.sub).toBe("user-2");
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(600);
  });
});
