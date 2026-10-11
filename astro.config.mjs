import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  site: "https://rrr-resume-web.example.com",
  integrations: [react()],
  adapter: undefined, // Static by default, can be changed for SSR
  compressHTML: true,
  build: {
    inlineStylesheets: "auto",
  },
  vite: {
    server: {
      // Local backend facade (RRR_PORT, default :8000). Same-origin /api
      // keeps the browser out of CORS; no such proxying in production.
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${process.env.RRR_PORT || 8000}`,
          changeOrigin: true,
        },
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
        },
      },
    },
  },
});