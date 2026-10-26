import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AuthConfig } from "../config.js";

export interface VerifiedIdentity {
  subject: string;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
}

const ASYMMETRIC_ALGORITHMS = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "EdDSA",
] as const;

export function createTokenVerifier(config: AuthConfig | null): TokenVerifier | null {
  if (!config) {
    return null;
  }

  const jwks = createRemoteJWKSet(new URL(config.jwksUrl), {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 600_000,
  });

  return {
    async verify(token: string): Promise<VerifiedIdentity> {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: [...ASYMMETRIC_ALGORITHMS],
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
