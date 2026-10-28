import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      // The app, plus the living style guide at /design.html
      input: { app: resolve(import.meta.dirname, "index.html"), design: resolve(import.meta.dirname, "design.html") },
    },
  },
});
