import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

/**
 * Vite restarts when vite.config.js or postcss.config.js change, but not when
 * tailwind.config.js does — the dev server keeps compiling with the palette it
 * loaded at startup, so `@apply` starts failing on classes that were just added
 * (e.g. "The `border-stone` class does not exist") while `vite build` is fine.
 */
function restartOnTailwindConfigChange() {
  return {
    name: "tailwind-config-restart",
    apply: "serve",
    configureServer(server) {
      const configFile = new URL("./tailwind.config.js", import.meta.url).pathname;
      const onChange = (file) => {
        if (file === configFile) server.restart();
      };
      server.watcher.add(configFile);
      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
    },
  };
}

export default defineConfig({
  plugins: [
    restartOnTailwindConfigChange(),
    react(),
    cloudflare(),
  ],
});
