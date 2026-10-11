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
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
        },
      },
    },
  },
});