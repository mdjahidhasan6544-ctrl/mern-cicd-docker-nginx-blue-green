// ESLint v9 flat config — backend
// Extends @eslint/js recommended + Node globals + a few project-specific rules.
import js from "@eslint/js";
import globals from "globals";

export default [
  // Ignore patterns
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "build/**",
      "**/*.min.js"
    ]
  },

  // Base recommended rules
  js.configs.recommended,

  // Project-specific rules
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2024
      }
    },
    rules: {
      // ── Likely bugs ─────────────────────────────────────────────────────
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-debugger": "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-else-return": "error",

      // ── Security-adjacent ───────────────────────────────────────────────
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",

      // ── Style / consistency ────────────────────────────────────────────
      "eqeqeq": ["error", "always", { null: "ignore" }],
      "curly": ["error", "multi-line"],
      "no-multi-spaces": "warn",
      "comma-dangle": ["error", "never"],
      "quotes": ["error", "double", { avoidEscape: true, allowTemplateLiterals: true }],
      "semi": ["error", "always"]
    }
  },

  // Test files: relax a few rules and add vitest globals
  {
    files: ["**/*.test.js", "**/*.spec.js", "tests/**", "**/__tests__/**"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.vitest  // vi, describe, it, expect, beforeAll, afterAll, etc.
      }
    },
    rules: {
      "no-unused-expressions": "off"
    }
  }
];
