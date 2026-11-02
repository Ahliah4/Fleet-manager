import { createHash, randomBytes } from "node:crypto";
import {
  importJWK,
  jwtVerify,
  SignJWT,
  type JWK,
} from "jose";

const FLOW_COOKIE = "fleet_mobile_flow";
const FLOW_TTL_SECONDS = 10 * 60;
const CODE_TTL_MS = 60_000;
const ACCESS_TTL_SECONDS = 10 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function assertMobileFlowStorageConfigured(): void {
  // The maps below are intentionally useful for local development only. A
  // restart would otherwise invalidate codes and lose refresh-token revocation
  // state, so production fails closed until a durable store is wired in.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Mobile authentication storage is not configured.");
  }
}

type FlowClaims = {
  challenge: string;
  state: string;
  redirectUri: string;
  authPath: "/auth/sign-in" | "/auth/sign-up";
};

type CodeRecord = {
  challenge: string;
  subject: string;
  email: string;
  name: string;
  expiresAt: number;
  used: boolean;
};

type RefreshRecord = {
  subject: string;
  email: string;
  name: string;
  expiresAt: number;
  revoked: boolean;
};

const codes = new Map<string, CodeRecord>();
const refreshTokens = new Map<string, RefreshRecord>();

function secret(): Uint8Array {
  const value = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!value || value.length < 32) {
    throw new Error("Mobile authentication is not configured.");
  }
  return new TextEncoder().encode(value);
}

function configuredRedirectUris(): string[] {
  return (process.env.MOBILE_REDIRECT_URIS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function assertRedirectUriAllowed(value: string): void {
  const allowed = configuredRedirectUris();
  if (!allowed.includes(value)) throw new Error("The mobile redirect is not allowed.");
}

export async function createFlowCookie(claims: FlowClaims): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${FLOW_TTL_SECONDS}s`)
    .sign(secret());
}

export async function readFlowCookie(value: string | undefined): Promise<FlowClaims> {
  if (!value) throw new Error("The mobile sign-in flow has expired.");
  const { payload } = await jwtVerify(value, secret(), { algorithms: ["HS256"] });
  if (
    typeof payload.challenge !== "string" ||
    typeof payload.state !== "string" ||
    typeof payload.redirectUri !== "string" ||
    (payload.authPath !== "/auth/sign-in" && payload.authPath !== "/auth/sign-up")
  ) {
    throw new Error("The mobile sign-in flow is invalid.");
  }
  assertRedirectUriAllowed(payload.redirectUri);
  return {
    challenge: payload.challenge,
    state: payload.state,
    redirectUri: payload.redirectUri,
    authPath: payload.authPath,
  };
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function issueCode(input: Omit<CodeRecord, "expiresAt" | "used">): string {
  assertMobileFlowStorageConfigured();
  const code = randomToken();
  codes.set(hash(code), { ...input, expiresAt: Date.now() + CODE_TTL_MS, used: false });
  return code;
}

export async function exchangeCode(input: {
  code: string;
  verifier: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  assertMobileFlowStorageConfigured();
  const key = hash(input.code);
  const record = codes.get(key);
  if (!record || record.used || record.expiresAt <= Date.now()) {
    codes.delete(key);
    throw new Error("The mobile sign-in code is invalid or expired.");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input.verifier),
  );
  const verifierChallenge = Buffer.from(digest).toString("base64url");
  if (verifierChallenge !== record.challenge) {
    throw new Error("The mobile sign-in verification failed.");
  }
  record.used = true;
  codes.delete(key);
  const refreshToken = randomToken();
  refreshTokens.set(hash(refreshToken), {
    subject: record.subject,
    email: record.email,
    name: record.name,
    expiresAt: Date.now() + REFRESH_TTL_MS,
    revoked: false,
  });
  return {
    accessToken: await mintAccessToken(record.subject),
    refreshToken,
    expiresIn: ACCESS_TTL_SECONDS,
  };
}

export async function rotateRefreshToken(value: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  assertMobileFlowStorageConfigured();
  const key = hash(value);
  const record = refreshTokens.get(key);
  if (!record || record.revoked || record.expiresAt <= Date.now()) {
    refreshTokens.delete(key);
    throw new Error("The refresh session has expired.");
  }
  record.revoked = true;
  const refreshToken = randomToken();
  refreshTokens.set(hash(refreshToken), { ...record, revoked: false });
  return {
    accessToken: await mintAccessToken(record.subject),
    refreshToken,
    expiresIn: ACCESS_TTL_SECONDS,
  };
}

export function revokeRefreshToken(value: string): void {
  assertMobileFlowStorageConfigured();
  const record = refreshTokens.get(hash(value));
  if (record) record.revoked = true;
}

async function gatewaySigningKey() {
  const raw = process.env.GATEWAY_JWT_PRIVATE_JWK;
  if (!raw) throw new Error("Gateway token signing is not configured.");
  return importJWK(JSON.parse(raw) as JWK, "EdDSA");
}

export async function mintAccessToken(subject: string): Promise<string> {
  const issuer = process.env.GATEWAY_JWT_ISSUER;
  const audience = process.env.GATEWAY_JWT_AUDIENCE;
  if (!issuer || !audience) throw new Error("Gateway token signing is not configured.");
  return new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: "fleet-gateway-1" })
    .setSubject(subject)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(await gatewaySigningKey());
}

export async function publicJwks(): Promise<{ keys: JWK[] }> {
  const raw = process.env.GATEWAY_JWT_PUBLIC_JWK;
  if (!raw) throw new Error("Gateway token verification is not configured.");
  return { keys: [JSON.parse(raw) as JWK] };
}

export const mobileFlowCookieName = FLOW_COOKIE;
