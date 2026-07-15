// tst_module_decorators_001 — GATE for Stage 3b: the BUNDLED module surface must
// register its tools via the @tool/@writeTool decorators exactly like the
// deno_ast on-the-fly path. The decorators push metadata to a WeakMap keyed by
// the class prototype; definePlugin's init() reads it back. If Bun's __decorate
// passes a different target than deno_ast's legacy decorators, the registry is
// empty → no tools → every plugin breaks in prod. `__decorate` is plain
// engine-agnostic JS (no reflect-metadata), so verifying in Bun is sufficient.
import { test, expect, beforeAll } from "bun:test";
import { buildPlugin, buildAll, discoverPlugins } from "./build-plugins.ts";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const REPO = join(import.meta.dir, "..");
const DIST = join(REPO, "plugins_dist");

interface ToolDef {
  name: string;
  description: string;
  requires_approval: boolean;
}
interface ModuleShape {
  init: (graph: unknown, ctx: unknown, util: unknown, rpc: unknown) => Promise<void>;
  rpcHandlers: Record<string, unknown>;
  toolDefinitions: ToolDef[];
}

let mod: ModuleShape;

beforeAll(async () => {
  await buildPlugin("file", { pluginsDir: join(REPO, "plugins"), distDir: DIST });
  const bundle = JSON.parse(readFileSync(join(DIST, "modules", "file", "bundle.json"), "utf8")) as {
    module?: { dist: string };
  };
  if (!bundle.module) throw new Error("no module bundle produced");
  const modPath = join(DIST, "modules", "file", "module", "dist", bundle.module.dist);
  // Evaluating the bundle runs definePlugin → sets globalThis.__magnis_plugin_module.
  await import(modPath);
  mod = (globalThis as unknown as { __magnis_plugin_module: ModuleShape }).__magnis_plugin_module;
});

// GATE for Stage 3b. Bun.build alone lowers @tool/@writeTool to TC39 decorators
// (ignoring tsconfig experimentalDecorators) → registry keyed by the wrong target
// → 0 tools. build-plugins.ts works around this by transpiling each .ts with the
// TypeScript compiler (legacy decorators) in a Bun onLoad hook, so the bundled
// module registers tools exactly like the isolate's deno_ast LegacyTypeScript
// loader. This test proves that equivalence on the produced artifact.
test("tst_module_decorators_001: bundled module decorators register the plugin's tools", async () => {
  expect(mod).toBeTruthy();
  // toolDefinitions are empty until init() reads the decorator registry.
  const ctx = { extension_id: "file", user_id: "system", extension_kind: "module" };
  await mod.init({}, ctx, {}, { execute: async () => undefined });

  const names = mod.toolDefinitions.map((t) => t.name).sort();
  expect(names).toContain("file.list");
  expect(names).toContain("file.get");
  expect(names).toContain("file.attach");

  // file.attach is a @writeTool → requires_approval true (decorator carried the flag)
  const attach = mod.toolDefinitions.find((t) => t.name === "file.attach");
  expect(attach?.requires_approval).toBe(true);
  // file.get is a read @tool → requires_approval false
  const get = mod.toolDefinitions.find((t) => t.name === "file.get");
  expect(get?.requires_approval).toBe(false);
});

// All-plugin guard: NO module bundle may contain the TC39 decorator marker
// (`__decorateElement`). If it does, Bun's decorator lowering leaked past the
// tsc onLoad hook and that plugin's tools would silently fail to register.
test("tst_module_decorators_002: no module bundle emits TC39 decorators", async () => {
  const pluginsDir = join(REPO, "plugins");
  await buildAll({ pluginsDir, distDir: DIST });
  const offenders: string[] = [];
  for (const id of discoverPlugins(pluginsDir)) {
    const bundlePath = join(DIST, "modules", id, "bundle.json");
    if (!existsSync(bundlePath)) continue;
    const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as { module?: { dist: string } };
    if (!bundle.module) continue;
    const js = readFileSync(join(DIST, "modules", id, "module", "dist", bundle.module.dist), "utf8");
    if (js.includes("__decorateElement(")) offenders.push(id);
  }
  expect(offenders).toEqual([]);
});
