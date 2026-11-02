import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/worker.js" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "fleet-manager",
    entrypoint,
    compatibilityDate: "2025-02-04",
    env: {
      ASSETS: bindings.assets(),
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
