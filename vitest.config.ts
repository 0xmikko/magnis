// The node lane: V8 module logic + SDK tests, with NOTHING DOM-shaped in
// scope. A module that reaches for `document` fails here, and that is the
// point of keeping this lane separate.
//
// The UI suites under `plugins/modules/*/ui/__tests__/` are the OTHER lane —
// `vitest.ui.config.ts`, happy-dom, `@magnis/host/*` resolved at
// `packages/host-testdouble`. They used to run in the closed frontend's
// vitest, which checked this repository out as a git submodule; the submodule
// is gone and they run here. `bun run test:ui`.
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "plugins/modules/**/module/**/*.test.ts",
      "plugins/modules/**/ui/**/sourceStatusAdapter.test.ts",
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
