import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  importJWK,
  jwtVerify,
  SignJWT,
  type JWK,
} from "jose";
import {
  createMemoryMobileFlowStore,
  type MobileFlowStore,
  type RefreshToken,
} from "./mobile-store";

const FLOW_COOKIE = "fleet_mobile_flow";
const FLOW_TTL_SECONDS = 10 * 60;
const CODE_TTL_MS = 60_000;
const ACCESS_TTL_SECONDS = 10 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let testStore: MobileFlowStore | null = null;
let configuredStore: MobileFlowStore | null = null;

/**
 * Production must use durable storage. The in-memory store is only for local
 * development and tests; a process restart would lose codes and revoke state.
 */
export function assertMobileFlowStorageConfigured(
  nodeEnv = process.env.NODE_ENV,
  storageMode = process.env.MOBILE_FLOW_STORAGE,
): void {
  if (nodeEnv !== "production") return;
  if (storageMode !== "durable-object") {
    throw new Error("Mobile authentication storage is not configured.");
  }
}

export function setMobileFlowStoreForTests(store: MobileFlowStore | null): void {
  testStore = store;
  configuredStore = null;
}

async function getStore(): Promise<MobileFlowStore> {
  if (testStore) return testStore;
  if (configuredStore) return configuredStore;

  assertMobileFlowStorageConfigured();
  const mode = process.env.MOBILE_FLOW_STORAGE ?? "memory";
  if (mode === "durable-object") {
    const { createCloudflareMobileFlowStore } = await import(
      "./mobile-store-cloudflare"
    );
    configuredStore = createCloudflareMobileFlowStore();
    return configuredStore;
  }
  if (mode !== "memory") {
    throw new Error("Mobile authentication storage is not configured.");
  }
  configuredStore = createMemoryMobileFlowStore();
  return configuredStore;
}

type FlowClaims = {
  challenge: string;
  state: string;
  redirectUri: string;
  authPath: "/auth/sign-in" | "/auth/sign-up";
};

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

function newRefreshToken(familyId: string): string {
  return `${familyId}.${randomToken()}`;
}

function refreshFamily(value: string): string | null {
  const separator = value.indexOf(".");
  if (separator < 1 || separator > 128 || separator === value.length - 1) {
    return null;
  }
  const familyId = value.slice(0, separator);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    familyId,
  )
    ? familyId
    : null;
}

export async function issueCode(input: {
  challenge: string;
  subject: string;
  email: string;
  name: string;
}): Promise<string> {
  assertMobileFlowStorageConfigured();
  const code = randomToken();
  await (await getStore()).insertCode({
    codeHash: hash(code),
    challenge: input.challenge,
    subject: input.subject,
    email: input.email,
    name: input.name,
    expiresAt: Date.now() + CODE_TTL_MS,
  });
  return code;
}

export async function exchangeCode(input: {
  code: string;
  verifier: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  assertMobileFlowStorageConfigured();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input.verifier),
  );
  const verifierChallenge = Buffer.from(digest).toString("base64url");
  const now = Date.now();
  const consumed = await (await getStore()).consumeCode(
    hash(input.code),
    verifierChallenge,
    now,
  );
  if (!consumed) {
    throw new Error("The mobile sign-in code is invalid or expired.");
  }

  const familyId = randomUUID();
  const refreshToken = newRefreshToken(familyId);
  const record: RefreshToken = {
    tokenHash: hash(refreshToken),
    familyId,
    subject: consumed.subject,
    email: consumed.email,
    name: consumed.name,
    expiresAt: now + REFRESH_TTL_MS,
  };
  await (await getStore()).insertRefreshToken(record);

  return {
    accessToken: await mintAccessToken(consumed.subject),
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
  const now = Date.now();
  const familyId = refreshFamily(value);
  if (!familyId) throw new Error("The refresh session has expired.");
  const refreshToken = newRefreshToken(familyId);
  const result = await (await getStore()).rotateRefreshToken(
    hash(value),
    familyId,
    { tokenHash: hash(refreshToken), expiresAt: now + REFRESH_TTL_MS },
    now,
  );

  if (result.status === "reused") {
    throw new Error("The refresh session is no longer valid.");
  }
  if (result.status !== "rotated") {
    throw new Error("The refresh session has expired.");
  }

  return {
    accessToken: await mintAccessToken(result.token.subject),
    refreshToken,
    expiresIn: ACCESS_TTL_SECONDS,
  };
}

export async function revokeRefreshToken(value: string): Promise<void> {
  assertMobileFlowStorageConfigured();
  const familyId = refreshFamily(value);
  if (!familyId) return;
  await (await getStore()).revokeRefreshToken(hash(value), familyId, Date.now());
}

export async function cleanupExpiredMobileFlowState(): Promise<void> {
  assertMobileFlowStorageConfigured();
  await (await getStore()).cleanup(Date.now());
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
