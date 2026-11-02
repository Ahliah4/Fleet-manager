import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

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
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.png",
        "favicon.svg",
        "ip-motors-logo.webp",
        "ip-motors-mark.webp",
        "icon-192.png",
        "icon-512.png",
        "icon-512-maskable.png",
        "apple-touch-icon.png",
      ],
      manifest: {
        id: "/",
        name: "IP Motors Fleet Manager",
        short_name: "IP Motors Fleet",
        description: "Shared vehicle, driver, maintenance, and finance operations for IP Motors.",
        theme_color: "#131313",
        background_color: "#f2f2f2",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "any",
        start_url: "/",
        scope: "/",
        lang: "en",
        categories: ["business", "productivity", "utilities"],
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
});
