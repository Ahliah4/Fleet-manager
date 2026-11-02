import { bindings, defineConfig, defineWorker, exports } from "cf/config";

function optionalText(name: string) {
  const value = process.env[name]?.trim();
  return value ? bindings.text(value) : undefined;
}

export default defineConfig({
  worker: defineWorker({
    name: "auth-gateway",
    entrypoint: "./worker.ts",
    compatibilityDate: "2026-11-02",
    compatibilityFlags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      MOBILE_AUTH_FLOW: bindings.durableObject({
        worker: "auth-gateway",
        exportName: "MobileAuthFlowStore",
      }),
      MOBILE_FLOW_STORAGE: bindings.text("durable-object"),
      NEON_AUTH_BASE_URL: bindings.secret(),
      NEON_AUTH_COOKIE_SECRET: bindings.secret(),
      MOBILE_REDIRECT_URIS: bindings.secret(),
      GATEWAY_JWT_ISSUER: bindings.secret(),
      GATEWAY_JWT_AUDIENCE: bindings.secret(),
      GATEWAY_JWT_PRIVATE_JWK: bindings.secret(),
      GATEWAY_JWT_PUBLIC_JWK: bindings.secret(),
      IOS_APP_TEAM_ID: optionalText("IOS_APP_TEAM_ID"),
      IOS_BUNDLE_ID: optionalText("IOS_BUNDLE_ID"),
      ANDROID_APP_PACKAGE: optionalText("ANDROID_APP_PACKAGE"),
      ANDROID_SHA256_CERT_FINGERPRINTS: optionalText(
        "ANDROID_SHA256_CERT_FINGERPRINTS",
      ),
    },
    exports: {
      MobileAuthFlowStore: exports.durableObject({ storage: "sqlite" }),
    },
  }),
});
