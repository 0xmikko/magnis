/** tst_pub_double_surface_001 — the double agrees with the host's declarations.
 *
 * `packages/host-stubs/types` is generated from the host and is the contract.
 * The double is hand-written. Two ways that can rot, and this pins both:
 *
 *   1. A plugin imports something from `@magnis/host/*` that the double does
 *      not export. The UI lane catches this the moment the plugin runs, but
 *      the failure reads as a module error deep inside a render — here it
 *      reads as what it is.
 *   2. The double exports something the HOST does not. That one nothing
 *      catches: the plugin compiles here, its tests pass here, and it breaks
 *      in the app. Anything the double adds beyond the contract must be
 *      listed in TEST_ONLY below, in the open.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test, vi } from "vitest";
import { defineModule } from "@magnis/host/base";
import { AgentContributionRegistry } from "@/runtime/agent/contributions";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const SHIMS = join(ROOT, "packages/host-stubs/types/frontend/src/runtime/plugins/hostShims");
const UI_INDEX = join(ROOT, "packages/host-stubs/types/frontend/src/components/ui/index.d.ts");

/** The value (non-type) exports a `.d.ts` re-export barrel declares. */
function declaredValueExports(dts: string): Set<string> {
  const names = new Set<string>();
  const source = readFileSync(dts, "utf8");
  for (const match of source.matchAll(/export\s+\{([^}]*)\}\s+from/g)) {
    for (const raw of (match[1] ?? "").split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(/export\s+declare\s+(?:function|const|class)\s+(\w+)/g)) {
    if (match[1]) names.add(match[1]);
  }
  return names;
}

/** Everything a module actually exports at runtime. */
async function actualExports(specifier: string): Promise<Set<string>> {
  const mod = (await import(specifier)) as Record<string, unknown>;
  return new Set(Object.keys(mod).filter((k) => k !== "default"));
}

/**
 * Exports the double adds that the host does not declare.
 *
 * Each one is a deliberate affordance for tests, not a host API a plugin may
 * use. Adding a line here is a decision; growing this list quietly is how a
 * double stops being a double.
 */
const TEST_ONLY: Readonly<Record<string, readonly string[]>> = {
  // Seeding the hooks that the host fills from React context.
  runtime: ["setHostRuntime", "setHostRouter", "HostRuntimeProvider"],
  // The tool-call state machine and the schema registry's readers: internal
  // to the host's own modules, re-exported here so `base` stays one file.
  base: [
    "resolveToolCallState",
    "schemaIcon",
    "schemaLabel",
    "schemaTabLabel",
    "schemaVisual",
    "allSchemaEntries",
    "normalizeSchemaId",
    "entityHref",
  ],
  // `inferSchemaFromTool` is `extractEntities`' own helper in client-core;
  // the double exposes it so its behaviour can be pinned directly.
  agent: ["inferSchemaFromTool"],
  ui: ["cn"],
  composer: [],
  layout: [],
  markdown: [],
  utils: [],
};

const MODULES = ["agent", "base", "composer", "layout", "markdown", "runtime", "utils"] as const;

describe("tst_pub_double_surface_001", () => {
  test("the generated host types are present at all", () => {
    // Without them this whole suite would pass vacuously.
    const files = readdirSync(SHIMS).filter((f) => f.endsWith(".d.ts"));
    expect(files.length).toBeGreaterThanOrEqual(MODULES.length);
  });

  for (const name of MODULES) {
    test(`@magnis/host/${name}: the double invents nothing`, async () => {
      const declared = declaredValueExports(join(SHIMS, `${name}.d.ts`));
      const actual = await actualExports(`../${name}`);
      const allowed = new Set(TEST_ONLY[name] ?? []);
      const invented = [...actual].filter((k) => !declared.has(k) && !allowed.has(k));
      expect(
        invented,
        `${name}: exported here but not declared by the host — either the host grew it and the stubs are stale, or the double is making it up`,
      ).toEqual([]);
    });
  }

  test("@magnis/host/ui: the double invents nothing", async () => {
    const declared = declaredValueExports(UI_INDEX);
    const actual = await actualExports("../ui");
    const allowed = new Set(TEST_ONLY.ui ?? []);
    const invented = [...actual].filter((k) => !declared.has(k) && !allowed.has(k));
    expect(invented).toEqual([]);
  });

  test("every host module a plugin imports from has a double", async () => {
    // The UI lane aliases these by name; a module missing here would fail as
    // an unresolved import inside somebody's component instead.
    for (const name of MODULES) {
      const mod = await actualExports(`../${name}`);
      expect(mod.size, `${name} exports nothing`).toBeGreaterThan(0);
    }
  });
});

/** @test-id: tst_pub_double_pairs_001
 * @scenario: scn_tools_rendering
 * @covers: packages/host-testdouble/base.tsx::defineModule
 * @covers: packages/host-testdouble/agent-contributions.ts::resolveHistoryRenderer
 * @deterministic: yes — two local renderer registrations
 */
test("tst_pub_double_pairs_001 the host double resolves exact pairs and isolates legacy history", () => {
  const Message = (): null => null;
  const Address = (): null => null;
  const module = defineModule({ id: "email", title: "Email", icon: null, iconName: "mail", themeColor: "blue", entityTypes: ["message", "address"], primaryEntityType: "message", toolCallRenderers: [
    { entity: "email.message", actions: ["create"], Render: Message },
    { entity: "email.address", actions: ["create"], Render: Address },
  ] });
  if (module.agent === undefined) throw new Error("Missing module contribution");
  const legacy = { id: "email-legacy", moduleId: "email", match: () => true, Render: (): null => null, priority: 100 };
  const registry = new AgentContributionRegistry();
  registry.register("email", { ...module.agent, historyRenderers: [...(module.agent.historyRenderers ?? []), legacy] });
  const block = { id: "call", kind: "tool_call" as const, toolName: "email.send", payload: {} };
  expect(registry.resolveHistoryRenderer({ ...block, toolBinding: { entity: "email.message", operation: "create" } })?.Render).toBe(Message);
  expect(registry.resolveHistoryRenderer({ ...block, toolBinding: { entity: "email.address", operation: "create" } })?.Render).toBe(Address);
  expect(registry.resolveHistoryRenderer({ ...block, toolBinding: { entity: "email.message", operation: "delete" } })).toBeNull();
  expect(registry.resolveHistoryRenderer(block)).toBe(legacy);
});

/** @test-id: tst_pub_double_pairs_002
 * @scenario: scn_tools_rendering
 * @covers: packages/host-testdouble/agent-contributions.ts::register
 * @covers: packages/host-testdouble/agent-contributions.ts::resolveAllowlistTarget
 * @deterministic: yes — in-memory candidate replacement and recipient callbacks
 */
test("tst_pub_double_pairs_002 rejects foreign and duplicate candidates atomically and routes only to the owner", () => {
  const registry = new AgentContributionRegistry();
  const binding = { entity: "email.message", operation: "create" };
  const renderer = { id: "email-create", moduleId: "email", binding, match: () => true, Render: (): null => null };
  const target = { action: "create", targetType: "email.address", targetId: "morgan@example.test" };
  const wrongOwner = vi.fn(() => ({ ...target, targetId: "wrong" }));
  const owner = vi.fn(() => target);
  registry.register("telegram", { extractAllowlistTarget: wrongOwner });
  registry.register("email", { historyRenderers: [renderer], extractAllowlistTarget: owner });
  expect(() => registry.register("telegram", { historyRenderers: [{ ...renderer, moduleId: "telegram" }] })).toThrow("owner");
  expect(() => registry.register("email", { historyRenderers: [renderer, { ...renderer, id: "duplicate" }] })).toThrow("duplicate");
  expect(registry.resolveHistoryRenderer({ id: "call", kind: "tool_call", toolBinding: binding, payload: {} })).toBe(renderer);
  const call = { name: "create", args: { to: target.targetId }, toolBinding: binding };
  expect(registry.resolveAllowlistTarget(call)).toEqual(target);
  expect(wrongOwner).not.toHaveBeenCalled();
  expect(owner).toHaveBeenCalledWith(call);
});
