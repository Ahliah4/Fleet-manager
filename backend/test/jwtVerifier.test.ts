import { describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createTokenVerifier } from "../src/auth/jwtVerifier.js";

describe("Neon Managed Better Auth JWT verification", () => {
  async function setup() {
    const { publicKey, privateKey } = await generateKeyPair("EdDSA");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-neon-auth-key";
    jwk.alg = "EdDSA";
    const origin = "https://auth.example.test";
    const verifier = createTokenVerifier({
      issuer: origin,
      audience: origin,
      jwksUrl: `${origin}/.well-known/jwks.json`,
      clockToleranceSeconds: 0,
    }, async () => new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    if (!verifier) throw new Error("Test verifier was not configured.");
    const token = (subject: string, expiration: number, signingKey = privateKey, kid = jwk.kid) =>
      new SignJWT({})
        .setProtectedHeader({ alg: "EdDSA", kid })
        .setSubject(subject)
        .setIssuer(origin)
        .setAudience(origin)
        .setIssuedAt()
        .setExpirationTime(expiration)
        .sign(signingKey);
    return { verifier, token };
  }

  it("accepts a signed, unexpired EdDSA token and returns only its subject", async () => {
    const { verifier, token } = await setup();
    await expect(verifier.verify(await token("neon-subject-1", Math.floor(Date.now() / 1000) + 60)))
      .resolves.toEqual({ subject: "neon-subject-1" });
  });

  it("rejects expired tokens", async () => {
    const { verifier, token } = await setup();
    await expect(verifier.verify(await token("neon-subject-1", Math.floor(Date.now() / 1000) - 60)))
      .rejects.toThrow();
  });

  it("rejects a token signed by a key outside the configured JWKS", async () => {
    const { verifier, token } = await setup();
    const { privateKey: otherKey } = await generateKeyPair("EdDSA");
    await expect(verifier.verify(await token(
      "neon-subject-1",
      Math.floor(Date.now() / 1000) + 60,
      otherKey,
      "attacker-key",
    ))).rejects.toThrow();
  });
});
