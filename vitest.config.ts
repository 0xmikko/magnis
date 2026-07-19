// Standalone plugin-tree test lane (plugins-public-repo DEC-3/DEC-4):
// V8 module logic + SDK tests run with NOTHING from the closed frontend.
// UI (__tests__ under ui/) stay in the closed frontend's vitest, which runs
// them against the REAL @magnis/host shims — that is the integration gate;
// standalone UI coverage is typecheck-only via @magnis/host-stubs.
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "plugins/modules/**/module/**/*.test.ts",
      "packages/plugin-sdk/__tests__/**/*.test.ts",
      // testkit ships TWO test lanes in one package: module.test.ts is vitest;
      // source.test.ts is bun (`bun:test`, run by scripts/test-connectors.sh).
      // Pick up ONLY the vitest one — globbing `**` would drag the bun file in.
      "packages/testkit/__tests__/module.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@magnis/plugin-sdk": resolve(__dirname, "./packages/plugin-sdk/index.ts"),
      "@magnis/connector-sdk": resolve(__dirname, "./packages/connector-sdk/index.ts"),
      "@magnis/testkit/module": resolve(__dirname, "./packages/testkit/module.ts"),
    },
  },
});
