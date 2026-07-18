// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

// The strictest reasonable TypeScript lint. type-aware (strictTypeChecked),
// no `any`, explicit boundaries, no floating promises. One config for the whole
// catalog — sources, modules, packages.
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/plugins_dist/**",
      "**/*.d.ts",
      "eslint.config.js",
      "vitest.config.ts",
      // Test files are outside the strict type-aware lint scope. They run via
      // their own lanes (bun test for connectors, vitest for module logic) and
      // are typecheck-exempt by existing convention (module tsconfigs already
      // exclude __tests__). UI __tests__ additionally live in the closed
      // frontend and depend on deps (@testing-library/react) not present here,
      // so they cannot be type-aware parsed in this tree at all.
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/__tests__/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
    },
  },
  // React lives only in module UI (.tsx).
  {
    files: ["plugins/modules/**/ui/**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: { globals: { window: "readonly", document: "readonly" } },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
);
