import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type JWTPayload,
} from "jose";
import type { AuthConfig } from "../config.js";

export interface VerifiedIdentity {
  subject: string;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
}

// Neon Managed Better Auth signs its JWTs with Ed25519. Pinning the expected
// algorithm prevents tokens from any other asymmetric signing family being
// accepted if the verifier configuration is changed accidentally.
const NEON_JWT_ALGORITHMS = ["EdDSA"] as const;

export function createTokenVerifier(
  config: AuthConfig | null,
  jwksFetch: typeof fetch = fetch,
): TokenVerifier | null {
  if (!config) {
    return null;
  }

  const jwks = createRemoteJWKSet(new URL(config.jwksUrl), {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 600_000,
    [customFetch]: (url, options) => jwksFetch(url, options),
  });

  return {
    async verify(token: string): Promise<VerifiedIdentity> {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: [...NEON_JWT_ALGORITHMS],
        clockTolerance: config.clockToleranceSeconds,
        requiredClaims: ["sub", "exp"],
      });

      const subject = subjectFromPayload(payload);
      if (!subject) {
        throw new Error("The token does not contain a valid subject.");
      }
      return { subject };
    },
  };
}

function subjectFromPayload(payload: JWTPayload): string | null {
  if (typeof payload.sub !== "string") {
    return null;
  }
  const subject = payload.sub.trim();
  if (subject.length === 0 || subject.length > 255) {
    return null;
  }
  return subject;
}
