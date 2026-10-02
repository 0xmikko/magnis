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
  GraphService,
  PluginDeps,
  PluginLogLevel,
  PluginLogger,
  PluginModuleShape,
  PluginUtil,
  RpcExecutor,
} from "@magnis/plugin-sdk";
import type {
  CanonicalEntity,
  CanonicalLink,
  JsonValue,
  LinkedEntity,
  PaginatedResponse,
  PluginContext,
  PluginToolDeclaration,
} from "@magnis/sdk";

// ───────────────────────────── mockGraph ─────────────────────────────
/** A `GraphService` whose overridden methods are `vi.fn` spies, exposed on
 *  `.spies` for arrangement (`graph.spies.list_entities_window.mockResolvedValue`)
 *  and assertion (`expect(graph.spies.foo).toHaveBeenCalledTimes(1)`). */
export interface MockGraph
  extends GraphService {
  /** The `vi.fn` spies backing the overridden methods, keyed by op name. */
  spies: Record<string, Mock>;
}

/** The impls a test wants to install, typed against the REAL `GraphService`. */
export type GraphOverrides = Partial<GraphService>;

// Property accesses vitest/promise machinery makes on the proxy that must NOT
// be interpreted as graph ops (else `await`-ing or printing the graph throws).
const NON_OP = new Set(["then", "catch", "finally", "constructor"]);

/**
 * A THROWING `Proxy` over `GraphService`. Any method NOT in `overrides`
 * throws `unexpected graph op: <name>` WHEN CALLED — so a test that hits an op
 * it didn't arrange fails loudly instead of returning `undefined`, and the kit
 * never needs updating when `GraphService` grows a method (contrast: a
 * hand-built object silently omits the new op). Overridden methods are `vi.fn`
 * spies wrapping the provided impl, reachable via the returned graph directly
 * (they ARE the methods) and via `.spies` for `.mock*`/assertions.
 */
export function mockGraph(
  overrides: GraphOverrides = {},
): MockGraph {
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
  return proxy as unknown as MockGraph;
}

// ──────────────────────────── mountModule ────────────────────────────
export interface MountOpts {
  /** "direct" (default): `new Cls(deps)`. "dispatch": run through the SDK's
   *  `definePlugin`/`init` and expose the decorated `{ rpc, tools }` surface. */
  mode?: "direct" | "dispatch";
  /** The graph the module gets; defaults to an empty (fully-throwing) `mockGraph`. */
  graph?: MockGraph;
  /** Partial `PluginContext` merged over the defaults `{ userId: "u1",
   *  extensionKind: "plugin", extensionId: "test" }`. */
  ctx?: Partial<PluginContext>;
  util?: PluginUtil;
  /** A test rpc double. Looser than `RpcExecutor` (whose `execute` is generic
   *  over the return type) so a bare `vi.fn(async (m) => …)` is assignable
   *  without the `as unknown as PluginDeps` cast the modules used to carry. */
  rpc?: { execute: (method: string, params?: unknown) => unknown };
  /** A capturing logger; defaults to a fresh `mockLogger()`. */
  log?: MockLogger;
}

/** One entry a module emitted through `deps.log`. */
export interface CapturedLogEntry {
  level: PluginLogLevel;
  message: string;
  fields?: Record<string, unknown>;
}

/** A `PluginLogger` that records instead of shipping, so a test can assert
 *  that a failure path actually reported itself. Mirrors `MockGraph.spies`:
 *  the capture rides alongside the real surface. */
export interface MockLogger extends PluginLogger {
  readonly entries: CapturedLogEntry[];
}

export function mockLogger(): MockLogger {
  const entries: CapturedLogEntry[] = [];
  const spy = vi.fn(
    (level: PluginLogLevel, message: string, fields?: Record<string, unknown>): Promise<void> => {
      entries.push({ level, message, fields });
      return Promise.resolve();
    },
  );
  return { entries, log: spy };
}

export interface DirectMount<T> {
  module: T;
  graph: MockGraph;
  deps: PluginDeps;
}

export interface DispatchMount {
  /** Route to a decorated handler by its full name (`"companies.list"`) or bare
   *  suffix (`"list"`) — the `ctx.extensionId` prefix is tried automatically.
   *  `args` is the JSON the host would send. */
  rpc: (name: string, args: JsonValue) => unknown;
  /** The agent tool declarations `definePlugin` harvested (read tools + write
   *  tools; RPC-only handlers are excluded, matching the runtime). */
  tools: PluginToolDeclaration[];
  graph: MockGraph;
  deps: PluginDeps;
}

function buildDeps(
  opts: MountOpts,
): { deps: PluginDeps; graph: MockGraph } {
  const graph = opts.graph ?? mockGraph();
  const ctx: PluginContext = {
    userId: "u1",
    extensionKind: "plugin",
    extensionId: "test",
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
  const log = opts.log ?? mockLogger();
  return { deps: { graph, ctx, util, rpc, log }, graph };
}

export function mountModule<T extends object>(
  ModuleClass: new (deps: PluginDeps) => T,
  opts?: MountOpts & { mode?: "direct" },
): DirectMount<T>;
export function mountModule(
  ModuleClass: new (deps: PluginDeps) => object,
  opts: MountOpts & { mode: "dispatch" },
): Promise<DispatchMount>;
export function mountModule<T extends object>(
  ModuleClass: new (deps: PluginDeps) => T,
  opts: MountOpts = {},
): DirectMount<T> | Promise<DispatchMount> {
  const { deps, graph } = buildDeps(opts);
  if (opts.mode === "dispatch") {
    return (async (): Promise<DispatchMount> => {
      definePlugin(ModuleClass);
      const shape = (globalThis as unknown as { __magnis_plugin_module: PluginModuleShape })
        .__magnis_plugin_module;
      await shape.init(deps.graph, deps.ctx, deps.util, deps.rpc, deps.log);
      const lookup = (n: string): ((params: JsonValue) => unknown) | undefined => shape.rpcHandlers[n];
      const call = (name: string, args: JsonValue): unknown => {
        const handler = lookup(name) ?? lookup(`${deps.ctx.extensionId}.${name}`);
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
// The row builders the module tests copy-paste, typed against the SDK shapes
// the host answers, so a shape change surfaces here once.

const CREATED_AT = "2026-01-01T00:00:00Z";

/** A canonical `Entity`, as a connector delivered it. `over` sets `schemaId`
 *  (default `""`), `createdAt` (default a fixed timestamp), the
 *  `source.externalId` (default the id) or any other column. */
export function entity(id: string, name: string, over: Partial<CanonicalEntity> = {}): CanonicalEntity {
  return {
    id,
    owner: "u1",
    schemaId: "",
    schemaVersion: 1,
    createdAt: CREATED_AT,
    name,
    indexed: false,
    date: CREATED_AT,
    idx: null,
    isPinned: null,
    pinOrder: null,
    isArchived: null,
    properties: {},
    origin: "canonical",
    source: { source: "test", account: "a1", externalId: id },
    ...over,
  };
}

/** A canonical `Link`. It defaults open (`validUntil: null`); an ended one
 *  overrides the pair. */
export function link(from: string, to: string, kind: string, over: Partial<CanonicalLink> = {}): CanonicalLink {
  return {
    id: `${from}-${kind}-${to}`,
    owner: "u1",
    from,
    to,
    kind,
    createdAt: CREATED_AT,
    origin: "canonical",
    metadata: {},
    validFrom: null,
    validUntil: null,
    ...over,
  };
}

/** A `LinkedEntity` — a neighbor entity + the link that reached it. */
export function linkedEntity(ent: CanonicalEntity, over: Partial<CanonicalLink> = {}): LinkedEntity {
  return { entity: ent, link: link(ent.id, "to", "link", over) };
}

/** A `PaginatedResponse` holding `items` from the first row, every match on it
 *  unless the test says how many matched. */
export function page<Item>(items: Item[], total: number = items.length): PaginatedResponse<Item> {
  return { items, total, limit: Math.max(items.length, 1), offset: 0 };
}
