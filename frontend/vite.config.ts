import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiTarget = process.env.VITE_DEV_API_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin in dev: the browser talks to Vite, which forwards /api to FastAPI
    // (incl. Server-Sent Events). No CORS needed locally.
    proxy: { "/api": { target: apiTarget, changeOrigin: false } },
  },
  preview: { port: 4173, proxy: { "/api": { target: apiTarget } } },
  build: { sourcemap: false }, // pdf-lib is dynamically imported, so it ships as its own lazy chunk
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    restoreMocks: true,
  },
});
