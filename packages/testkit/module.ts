// @magnis/testkit/module — test doubles + DTO builders for Magnis module (V8)
// tests. The module test lane is vitest, so the spies are `vi.fn`.
//
// Kills the per-module copy-paste: every module test used to hand-roll a
// `makeGraph()` (a partial GraphService cast through `unknown`), a
// `makeModule()` (deps assembled + cast), and row builders (`ENT`/`WROW`/
// `canon`). Those drift as the contract grows and silently pass a
// non-conformant graph. This kit provides ONE conformant, self-defending set.
//
// Two ways to exercise a module:
//   - `mountModule(Cls)` (default "direct")   → `new Cls(deps)`; call methods
//     directly, as the tests do today.
//   - `mountModule(Cls, { mode: "dispatch" })` → run the class through
//     `definePlugin`/`init` and get a `{ rpc, tools }` surface, so a test can
//     assert the DECORATED rpc names + tool defs and their routing.

import { vi, type Mock } from "vitest";
import { definePlugin } from "@magnis/plugin-sdk";
import type {
  CanonicalRecord,
  FacetRecord,
  GraphService,
  LinkSummary,
  LinkedRow,
  PluginContext,
  PluginDeps,
  PluginModuleShape,
  PluginUtil,
  RawEntity,
  RpcExecutor,
  ToolDefinitionWire,
  WindowRow,
} from "@magnis/plugin-sdk";

// ───────────────────────────── mockGraph ─────────────────────────────
/** A `GraphService` whose overridden methods are `vi.fn` spies, exposed on
 *  `.spies` for arrangement (`graph.spies.list_entities_window.mockResolvedValue`)
 *  and assertion (`expect(graph.spies.foo).toHaveBeenCalledTimes(1)`). */
export interface MockGraph<
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
> extends GraphService<F, C> {
  /** The `vi.fn` spies backing the overridden methods, keyed by op name. */
  spies: Record<string, Mock>;
}

/** The impls a test wants to install, typed against the REAL `GraphService`. */
export type GraphOverrides<F extends object, C extends object> = Partial<GraphService<F, C>>;

// Property accesses vitest/promise machinery makes on the proxy that must NOT
// be interpreted as graph ops (else `await`-ing or printing the graph throws).
const NON_OP = new Set(["then", "catch", "finally", "constructor"]);

/**
 * A THROWING `Proxy` over `GraphService<F,C>`. Any method NOT in `overrides`
 * throws `unexpected graph op: <name>` WHEN CALLED — so a test that hits an op
 * it didn't arrange fails loudly instead of returning `undefined`, and the kit
 * never needs updating when `GraphService` grows a method (contrast: a
 * hand-built object silently omits the new op). Overridden methods are `vi.fn`
 * spies wrapping the provided impl, reachable via the returned graph directly
 * (they ARE the methods) and via `.spies` for `.mock*`/assertions.
 */
export function mockGraph<
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
>(overrides: GraphOverrides<F, C> = {}): MockGraph<F, C> {
  const spies: Record<string, Mock> = {};
  for (const [name, impl] of Object.entries(overrides)) {
    spies[name] = vi.fn(impl as (...args: unknown[]) => unknown);
  }
  const proxy = new Proxy(
    {},
    {
      get(_target, prop): unknown {
        if (prop === "spies") return spies;
        if (typeof prop === "symbol" || NON_OP.has(prop)) return undefined;
        if (prop in spies) return spies[prop];
        return (..._args: unknown[]): never => {
          throw new Error(`unexpected graph op: ${prop}`);
        };
      },
    },
  );
  return proxy as unknown as MockGraph<F, C>;
}

// ──────────────────────────── mountModule ────────────────────────────
export interface MountOpts<F extends object, C extends object> {
  /** "direct" (default): `new Cls(deps)`. "dispatch": run through the SDK's
   *  `definePlugin`/`init` and expose the decorated `{ rpc, tools }` surface. */
  mode?: "direct" | "dispatch";
  /** The graph the module gets; defaults to an empty (fully-throwing) `mockGraph`. */
  graph?: MockGraph<F, C>;
  /** Partial `PluginContext` merged over the defaults `{ user_id: "u1",
   *  extension_kind: "plugin", extension_id: "test" }`. */
  ctx?: Partial<PluginContext>;
  util?: PluginUtil;
  /** A test rpc double. Looser than `RpcExecutor` (whose `execute` is generic
   *  over the return type) so a bare `vi.fn(async (m) => …)` is assignable
   *  without the `as unknown as PluginDeps` cast the modules used to carry. */
  rpc?: { execute: (method: string, params?: unknown) => unknown };
}

export interface DirectMount<T, F extends object, C extends object> {
  module: T;
  graph: MockGraph<F, C>;
  deps: PluginDeps<F, C>;
}

export interface DispatchMount<F extends object, C extends object> {
  /** Route to a decorated handler by its full name (`"companies.list"`) or bare
   *  suffix (`"list"`) — the `ctx.extension_id` prefix is tried automatically. */
  rpc: (name: string, args?: unknown) => unknown;
  /** The agent tool definitions `definePlugin` harvested (read tools + write
   *  tools; RPC-only handlers are excluded, matching the runtime). */
  tools: ToolDefinitionWire[];
  graph: MockGraph<F, C>;
  deps: PluginDeps<F, C>;
}

function buildDeps<F extends object, C extends object>(
  opts: MountOpts<F, C>,
): { deps: PluginDeps<F, C>; graph: MockGraph<F, C> } {
  const graph = opts.graph ?? mockGraph<F, C>();
  const ctx: PluginContext = {
    user_id: "u1",
    extension_kind: "plugin",
    extension_id: "test",
    ...opts.ctx,
  };
  // NB: `RpcExecutor` is `{ execute }` (contract/module.ts) — the default is a
  // spy on `execute`, not a `call` fn, so modules that use `rpc.execute` work
  // out of the box.
  const util: PluginUtil = opts.util ?? {
    uuid_v5: vi.fn(() => Promise.resolve("00000000-0000-0000-0000-000000000000")),
  };
  // The loose test rpc is widened to the module-facing generic `RpcExecutor`;
  // the module's own `this.rpc.execute<T>(...)` call sites stay fully typed.
  const rpc = (opts.rpc ?? { execute: vi.fn() }) as unknown as RpcExecutor;
  return { deps: { graph, ctx, util, rpc }, graph };
}

export function mountModule<
  T extends object,
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
>(ModuleClass: new (deps: PluginDeps<F, C>) => T, opts?: MountOpts<F, C> & { mode?: "direct" }): DirectMount<T, F, C>;
export function mountModule<
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
>(
  ModuleClass: new (deps: PluginDeps<F, C>) => object,
  opts: MountOpts<F, C> & { mode: "dispatch" },
): Promise<DispatchMount<F, C>>;
export function mountModule<
  T extends object,
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
>(
  ModuleClass: new (deps: PluginDeps<F, C>) => T,
  opts: MountOpts<F, C> = {},
): DirectMount<T, F, C> | Promise<DispatchMount<F, C>> {
  const { deps, graph } = buildDeps(opts);
  if (opts.mode === "dispatch") {
    return (async (): Promise<DispatchMount<F, C>> => {
      definePlugin<F, C>(ModuleClass);
      const shape = (globalThis as unknown as { __magnis_plugin_module: PluginModuleShape })
        .__magnis_plugin_module;
      await shape.init(deps.graph, deps.ctx, deps.util, deps.rpc);
      const lookup = (n: string): ((params: unknown) => unknown) | undefined => shape.rpcHandlers[n];
      const call = (name: string, args?: unknown): unknown => {
        const handler = lookup(name) ?? lookup(`${deps.ctx.extension_id}.${name}`);
        if (!handler) throw new Error(`no rpc handler: ${name}`);
        return handler(args);
      };
      return { rpc: call, tools: shape.toolDefinitions, graph, deps };
    })();
  }
  const module = new ModuleClass(deps);
  return { module, graph, deps };
}

// ─────────────────────────────── builders ────────────────────────────
// The row/DTO builders the module tests copy-paste, typed against the real
// `@magnis/plugin-sdk` DTOs so a wire-shape change surfaces here once.

/** A `RawEntity`. `over` sets `schema_id` (default `""`), `created_at`
 *  (default a fixed timestamp), or any other column. */
export function entity(id: string, name: string, over: Partial<RawEntity> = {}): RawEntity {
  return { id, name, schema_id: "", created_at: "2026-01-01T00:00:00Z", ...over };
}

/** A `WindowRow` — an entity + its inline render-facet `data` (default `null`). */
export function windowRow(ent: RawEntity, data: unknown = null): WindowRow {
  return { entity: ent, data };
}

/** A `FacetRecord`. `over` sets `entity_id`/`source`/`observed_at`. */
export function facet(
  id: string,
  schema_id: string,
  data: unknown,
  over: Partial<FacetRecord> = {},
): FacetRecord {
  return { id, schema_id, source: "test", observed_at: "2026-01-01T00:00:00Z", data, ...over };
}

/** A `CanonicalRecord` — one merged (entity, key, value) triple. */
export function canonical(entity_id: string, key: string, value: unknown): CanonicalRecord {
  return { entity_id, key, value };
}

/** A `LinkedRow` — a neighbor entity + inline `data` + the edge that reached it. */
export function linkedRow(ent: RawEntity, data: unknown = null, link: Partial<LinkSummary> = {}): LinkedRow {
  return {
    entity: ent,
    data,
    link: { id: "l1", from_id: ent.id, to_id: "to", kind: "link", ...link },
  };
}
