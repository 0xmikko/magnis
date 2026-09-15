// The plugin UI lane.
//
// These suites used to run in the closed frontend's vitest, which checked
// this repository out as a git submodule and aliased `@magnis/host/*` at its
// real shims. That submodule is gone, so they run here, against
// `@magnis/host-testdouble` — see that package's README for what a double
// owes a plugin test and what it deliberately does not.
//
// Kept separate from `vitest.config.ts` because the two lanes disagree about
// the environment: module/SDK logic runs in `node` with nothing DOM-shaped in
// scope, and that is a property worth keeping — a module that reaches for
// `document` should fail there.
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const double = (name: string): string => resolve(__dirname, `./packages/host-testdouble/${name}`);

export default defineConfig({
  // The plugin tree compiles with `jsx: react-jsx` (tsconfig.base.json), but
  // vitest resolves tsconfig per package and several plugins have none — so
  // state the transform here rather than relying on discovery.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./packages/host-testdouble/vitest.setup.ts"],
    include: [
      "plugins/modules/**/ui/__tests__/**/*.test.{ts,tsx}",
      // The doubles' own suites run in this lane because they resolve through
      // the same aliases the plugins do.
      "packages/host-testdouble/__tests__/**/*.test.{ts,tsx}",
    ],
    // `sourceStatusAdapter` is UI-adjacent but pure logic, and the node lane
    // already runs it. Running it twice would double-count the coverage
    // receipt without testing anything more.
    exclude: ["**/sourceStatusAdapter.test.ts", "**/node_modules/**"],
  },
  resolve: {
    alias: {
      "@magnis/host/ui": double("ui.tsx"),
      "@magnis/host/base": double("base.tsx"),
      "@magnis/host/runtime": double("runtime.tsx"),
      "@magnis/host/agent": double("agent.tsx"),
      "@magnis/host/layout": double("layout.tsx"),
      "@magnis/host/composer": double("composer.tsx"),
      "@magnis/host/markdown": double("markdown.tsx"),
      "@magnis/host/utils": double("utils.ts"),
      // Three resolution suites reach past the shims into a host internal
      // (`AgentContributionRegistry`). tsconfig already points `@/*` at the
      // generated host types; this is the runtime half of the same pointer.
      "@/runtime/agent/contributions": double("agent-contributions.ts"),
      "@/modules/episodes/hooks/useMentionSearch": double("mention-search.ts"),
      "@magnis/plugin-sdk": resolve(__dirname, "./packages/plugin-sdk/index.ts"),
      "@magnis/connector-sdk": resolve(__dirname, "./packages/connector-sdk/index.ts"),
      "@magnis/testkit/module": resolve(__dirname, "./packages/testkit/module.ts"),
    },
  },
});
