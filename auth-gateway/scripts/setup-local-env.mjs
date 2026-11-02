import { generateKeyPairSync, randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const gatewayRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(gatewayRoot, ".env.local");
const overwrite = process.argv.includes("--force");

// Environment-specific; never commit a project Auth URL.
const neonAuthBaseUrl = process.env.NEON_AUTH_BASE_URL?.trim();
if (!neonAuthBaseUrl) {
  console.error(
    "Set NEON_AUTH_BASE_URL to the development branch Auth URL before running setup:local.",
  );
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const keyId = "fleet-gateway-1";
const privateJwk = { ...privateKey.export({ format: "jwk" }), kid: keyId, use: "sig", alg: "EdDSA" };
const publicJwk = { ...publicKey.export({ format: "jwk" }), kid: keyId, use: "sig", alg: "EdDSA" };

const values = {
  NEON_AUTH_BASE_URL: neonAuthBaseUrl,
  NEON_AUTH_COOKIE_SECRET: randomBytes(48).toString("base64url"),
  MOBILE_REDIRECT_URIS: "fleetops://auth/callback",
  GATEWAY_JWT_ISSUER: "http://localhost:3001",
  GATEWAY_JWT_AUDIENCE: "http://localhost:3001",
  GATEWAY_JWT_PRIVATE_JWK: JSON.stringify(privateJwk),
  GATEWAY_JWT_PUBLIC_JWK: JSON.stringify(publicJwk),
  MOBILE_FLOW_STORAGE: "memory",
};

const contents = `${Object.entries(values)
  .map(([name, value]) => `${name}='${value}'`)
  .join("\n")}\n`;

try {
  await writeFile(outputPath, contents, {
    encoding: "utf8",
    mode: 0o600,
    flag: overwrite ? "w" : "wx",
  });
  await chmod(outputPath, 0o600);
  console.log("Created auth-gateway/.env.local for local development.");
  console.log("Secret and key values were written privately and were not printed.");
} catch (error) {
  if (error && typeof error === "object" && error.code === "EEXIST") {
    console.error("auth-gateway/.env.local already exists; no changes were made.");
    console.error("Use --force only if you intend to invalidate existing local sessions.");
    process.exitCode = 1;
  } else {
    console.error("Could not create the local gateway configuration.");
    process.exitCode = 1;
  }
}
