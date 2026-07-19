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
    ],
  },
  resolve: {
    alias: {
      "@magnis/plugin-sdk": resolve(__dirname, "./packages/plugin-sdk/index.ts"),
      "@magnis/connector-sdk": resolve(__dirname, "./packages/connector-sdk/index.ts"),
    },
  },
});
