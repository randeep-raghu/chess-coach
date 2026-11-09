import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Kept apart from vite.config.ts so tests don't start the Cloudflare plugin.
export default defineConfig({
  resolve: {
    alias: { "@coach-content": fileURLToPath(new URL("./content-sample/explain/index.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "worker/**/*.test.ts", "shared/**/*.test.ts"],
  },
});
