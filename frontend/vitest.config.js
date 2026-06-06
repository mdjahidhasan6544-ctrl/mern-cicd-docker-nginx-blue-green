import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.{js,jsx}", "src/**/*.test.{js,jsx}"],
    css: false, // Don't process CSS imports in tests
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{js,jsx}"],
      exclude: ["src/main.jsx", "src/**/*.test.{js,jsx}"],
      // Ratchet these up as more tests are added
      thresholds: {
        lines: 10,
        functions: 10,
        branches: 5,
        statements: 10
      }
    }
  }
});
