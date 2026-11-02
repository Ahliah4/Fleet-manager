import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "ip-motors-fleet-api-development",
    entrypoint,
    compatibilityDate: "2026-10-30",
    env: {
      // DATABASE_URL is a Cloudflare Worker secret set during deployment.
      // It is intentionally absent from this config, source control, and Flutter.
      AUTH_ISSUER: process.env.AUTH_ISSUER
        ? bindings.text(process.env.AUTH_ISSUER)
        : undefined,
      AUTH_AUDIENCE: process.env.AUTH_AUDIENCE
        ? bindings.text(process.env.AUTH_AUDIENCE)
        : undefined,
      AUTH_JWKS_URL: process.env.AUTH_JWKS_URL
        ? bindings.text(process.env.AUTH_JWKS_URL)
        : undefined,
      AUTH_CLOCK_TOLERANCE_SECONDS: process.env.AUTH_CLOCK_TOLERANCE_SECONDS
        ? bindings.text(process.env.AUTH_CLOCK_TOLERANCE_SECONDS)
        : undefined,
      DATABASE_EXPECTED_ROLE: bindings.text(process.env.DATABASE_EXPECTED_ROLE ?? "app_rw"),
      CORS_ORIGIN: process.env.CORS_ORIGIN
        ? bindings.text(process.env.CORS_ORIGIN)
        : undefined,
    },
    observability: {
      enabled: true,
      logs: { enabled: true, invocationLogs: true, persist: true },
      traces: { enabled: true, persist: true },
    },
  },
});
