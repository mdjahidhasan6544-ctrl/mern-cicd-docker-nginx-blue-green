// ESLint v9 flat config — frontend (React + Vite)
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "**/*.min.js"
    ]
  },

  js.configs.recommended,

  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,        // for vite.config.js using process.env
        ...globals.es2024
      },
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    settings: {
      react: { version: "detect" }
    },
    rules: {
      // ── React ─────────────────────────────────────────────────────────
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",        // not needed with new JSX transform
      "react/prop-types": "off",                // using TS or runtime checks
      "react/jsx-uses-react": "off",

      // ── React Refresh (HMR) ───────────────────────────────────────────
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // ── Likely bugs ──────────────────────────────────────────────────
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-debugger": "error",
      "no-var": "error",
      "prefer-const": "error",

      // ── Style ────────────────────────────────────────────────────────
      "eqeqeq": ["error", "always", { null: "ignore" }],
      "no-else-return": "error",
      "comma-dangle": ["error", "never"],
      "quotes": ["error", "double", { avoidEscape: true, allowTemplateLiterals: true }],
      "semi": ["error", "always"]
    }
  },

  // Test files: relax a few rules and add vitest + testing-library globals
  {
    files: ["**/*.test.{js,jsx}", "**/*.spec.{js,jsx}", "tests/**", "**/__tests__/**"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        ...globals.vitest
      }
    },
    rules: {
      "no-unused-expressions": "off",
      "react-refresh/only-export-components": "off"
    }
  }
];
