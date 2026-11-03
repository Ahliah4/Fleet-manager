import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/worker.js" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "fleet-manager",
    entrypoint,
    compatibilityDate: "2025-02-04",
    env: {
      ASSETS: bindings.assets(),
      // Both upstream Workers live on the same workers.dev zone as this one.
      // Public fetches between them are blocked with Cloudflare error 1042, so
      // use service bindings for the auth exchange and the API proxy.
      AUTH_GATEWAY: bindings.worker({ worker: "auth-gateway" }),
      FLEET_API: bindings.worker({ worker: "ip-motors-fleet-api-development" }),
    },
    observability: {
      enabled: true,
      logs: { enabled: true, invocationLogs: true, persist: true },
      traces: { enabled: true, persist: true },
    },
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/auth/*", "/api/*"],
    },
  },
});
