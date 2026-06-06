import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true, // describe/it/expect without imports
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.js", "src/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.js"],
      exclude: [
        "src/index.js", // entrypoint
        "src/**/*.test.js"
      ],
      // Coverage gates — ratchet these up as more tests are added.
      // Set to current baseline so CI doesn't fail on day 1.
      // Recommended increments: 70% → 80% → 90% over the next 3 months.
      thresholds: {
        lines: 15,
        functions: 10,
        branches: 5,
        statements: 15
      }
    }
  }
});
