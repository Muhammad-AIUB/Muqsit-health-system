import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Test-only config. Vitest does not read tsconfig `paths`, so without this the
// app's own `@/…` imports fail to resolve and a suite dies at import time
// rather than reporting a failure — which reads as "no tests" in CI output.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
