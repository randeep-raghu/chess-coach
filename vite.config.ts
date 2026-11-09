import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Uses the private coach when it's present, so a fresh clone runs on the sample.
const privateCoach = fileURLToPath(new URL("./content-private/coach/index.tsx", import.meta.url));
const sampleCoach = fileURLToPath(new URL("./content-sample/coach/index.tsx", import.meta.url));
const privateContent = fileURLToPath(new URL("./content-private/explain/index.ts", import.meta.url));
const sampleContent = fileURLToPath(new URL("./content-sample/explain/index.ts", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      "@coach-content": existsSync(privateContent) ? privateContent : sampleContent,
      "@coach": existsSync(privateCoach) ? privateCoach : sampleCoach,
    },
  },
  server: { host: "localhost" },
});
