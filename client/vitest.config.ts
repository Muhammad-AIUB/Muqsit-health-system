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
  // The app's tsconfig sets jsx="preserve" and hands JSX to Next, which uses
  // React's automatic runtime. esbuild would otherwise fall back to the classic
  // transform and emit bare `React.createElement` into files that never import
  // React — "React is not defined" at render time, in tests only.
  esbuild: { jsx: "automatic" },
  test: {
    // 20 s, not the 5 s default. The jsdom component tests render the real
    // editor; on a loaded machine (coverage on, CI runner) two of them crossed
    // 5 s and failed with nothing wrong in the code. A timeout that depends on
    // how busy the machine is makes a flaky suite.
    testTimeout: 20_000,
    // `npx vitest run --coverage` writes coverage/coverage-summary.json and an
    // HTML report under coverage/.
    coverage: {
      // A RATCHET, not a target: each number is the value measured on
      // 2026-10-02, rounded down, so coverage cannot fall. Raise them when the
      // measured value rises; never lower one to get a change through. The
      // clinical logic in src/lib carries its own, higher floor.
      thresholds: {
        lines: 48,
        statements: 48,
        functions: 48,
        branches: 79,
        "src/lib/*.ts": { lines: 90 },
      },
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      // `all` so a file no test imports still counts (as 0%) instead of
      // silently dropping out of the denominator.
      all: true,
      // Still write the report when a test is red — on this (slow) machine a
      // single 5 s timeout otherwise discards the whole coverage run.
      reportOnFailure: true,
      include: [
        "src/lib/**",
        "src/hooks/**",
        "src/components/**",
        "src/context/**",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/__snapshots__/**",
        "src/test/**",
        "src/data/**",
        "src/vendor/**",
      ],
    },
  },
});
