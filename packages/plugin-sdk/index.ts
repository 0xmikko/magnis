// `@magnis/plugin-sdk` — shared contract + runtime for every Magnis
// plugin.
//
// Two consumers:
//   - frontend (type-only): `import type { ListParams } from "@magnis/plugin-sdk"`.
//     The runtime half below is erased — never bundled into the host.
//   - plugin module/ code (V8 backend): `import { definePlugin, tool }`
//     resolves to this file (loader special-case) and runs.
//
// Zero dependencies, no DOM — loads in the bare V8 isolate. Additions
// here are public API across all plugins; keep the surface tight.
//
// The PURE CONTRACT types now live in ./contract/* (reviewable in isolation):
//   - ./contract/module   — the module authoring surface + host GraphService
//   - ./contract/lifecycle — install/migration hooks
// They are re-exported below so every `import ... from "@magnis/plugin-sdk"`
// resolves unchanged; only the runtime (decorators, definePlugin, the
// searchEntitiesPage helper, defineLifecycle/defineMigration) lives here.

export * from "./contract/module";
export * from "./contract/lifecycle";

import type {
  GraphService,
  MethodRecorder,
  PluginContext,
  PluginDeps,
  PluginModuleShape,
  PluginUtil,
  RawEntity,
  RpcExecutor,
  SearchEntitiesPage,
  SearchEntitiesPageParams,
  SearchEntitiesParams,
  ToolDefinitionWire,
  ToolSpecInput,
} from "./contract/module";
import type { InstallContext, LifecycleHooks, MigrationStep } from "./contract/lifecycle";

// ── shared list-search paging (added 2026-07-03) ────────────────────────────
// The host list pane pages via {limit, offset, search} and computes
// hasMore = items.length < total. A search implementation that fetches only
// limit+offset rows truncates `total` to the visible window and KILLS infinite
// scroll (live bug: contacts pattern copied into x/linkedin). This helper is
// the one correct implementation: overfetch by ONE row past the window so
// `total` exceeds the shown page exactly while more matches exist.
// (Param/response types: SearchEntitiesPageParams / SearchEntitiesPage in ./contract/module.)
export async function searchEntitiesPage(
  graph: { search_entities_by_name(p: SearchEntitiesParams): Promise<RawEntity[]> },
  p: SearchEntitiesPageParams,
): Promise<SearchEntitiesPage> {
  // NO client-side re-sort: the backend order is a stable TOTAL order
  // (prefix-match first, date DESC, id), so top-N windows are consistent
  // prefixes across pages. Re-sorting different overfetch windows makes pages
  // disagree (overlap + missing rows) and the merged list stalls mid-scroll.
  const needed = p.offset + p.limit + 1;
  let fetchLimit = needed;
  for (;;) {
    const found = await graph.search_entities_by_name({
      query: p.query,
      schema_ids: [p.schema_id],
      limit: fetchLimit,
    });
    const kept = p.filter ? await p.filter(found) : found;
    // Done when the page (+1 for an honest hasMore) is filled with SURVIVORS,
    // or the source is exhausted (returned fewer than asked). Otherwise the
    // filter ate rows — grow the window and refetch (≤log₂ rounds).
    if (kept.length >= needed || found.length < fetchLimit) {
      return { entities: kept.slice(p.offset, p.offset + p.limit), total: kept.length };
    }
    fetchLimit *= 2;
  }
}

// ─────────────────── payload coercion helpers ──────────────────────────────
// Domain-neutral readers for the opaque `Record<string, unknown>` maps every
// plugin gets back from the graph (window-row `data`, `get_entity_full` facet
// `data`, sync-envelope `payload`). These were copy-pasted VERBATIM across the
// social modules (linkedin/x) — promoted here so there is ONE spelling. Runtime
// (not type-only): module code runs the SDK in V8, like `searchEntitiesPage`.
// Semantics are preserved EXACTLY — do not "fix" the asymmetric nullish returns
// without auditing callers:
//   - `str` → the value iff it is a string, else `undefined`.
//   - `num` → the value iff it is a number, else `null`.
// NB: email/meetings carry a DIFFERENT `str` variant that returns `null`; those
// are not reconciled here (out of the module pilot's scope) — a sweep decision.
export function str(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" ? v : undefined;
}
export function num(o: Record<string, unknown>, k: string): number | null {
  const v = o[k];
  return typeof v === "number" ? v : null;
}

// ─────────────────── tool metadata + decorators ───────────────────
// The decorator SPEC types (ToolSpecInput, ToolDefinitionWire, MethodRecorder,
// PluginModuleShape) live in ./contract/module. ToolMeta is the internal
// registry record — an implementation detail of this runtime, not contract.
interface ToolMeta {
  suffix: string;
  description: string;
  params: Record<string, unknown>;
  write: boolean;
  /// false = RPC-only handler (registered as an RPC method but NOT
  /// harvested as an agent tool). See `rpc()`.
  isTool: boolean;
  methodName: string;
}

// Keyed by the class PROTOTYPE — legacy TS method decorators receive
// the prototype as `target`, and a fresh instance's prototype is the
// same object, so definePlugin reads it back after `new`.
const REGISTRY = new WeakMap<object, ToolMeta[]>();

function record(suffix: string, spec: ToolSpecInput, write: boolean, isTool: boolean) {
  return function (target: object, methodName: string, _d: PropertyDescriptor): void {
    let list = REGISTRY.get(target);
    if (!list) {
      list = [];
      REGISTRY.set(target, list);
    }
    list.push({ suffix, description: spec.description, params: spec.params, write, isTool, methodName });
  };
}

/// Declare a read tool. `suffix` is the method name only — the backend
/// glues the `<plugin_id>.` prefix at init.
export function tool(suffix: string, spec: ToolSpecInput): MethodRecorder {
  return record(suffix, spec, false, true);
}
/// Declare a write tool (→ `requires_approval: true` on the agent
/// tool definition).
export function writeTool(suffix: string, spec: ToolSpecInput): MethodRecorder {
  return record(suffix, spec, true, true);
}
/// Declare an RPC-only handler: reachable via RPC (frontend / other
/// modules over the hub) but NOT exposed to the agent as a tool. Use for
/// internal/UI operations (e.g. add_member, list_for_entity) that the
/// agent shouldn't call directly. Mirrors a native module's
/// `rpc_methods()` that aren't in `tools()`.
export function rpc(suffix: string, spec: ToolSpecInput = { description: "", params: {} }): MethodRecorder {
  return record(suffix, spec, false, false);
}

/// Declare the plugin's sync ingest handler. The host `PluginModuleController`
/// bridge invokes it via the reserved `<plugin_id>.__sync__` method, passing
/// the `SourceEnvelope` (source_id, surface, account_id, user_id, kind,
/// remote_id, payload, …) as the single argument, whenever a sync envelope
/// routes to one of the plugin's declared `surfaces.sync_handlers`. The method
/// dispatches internally by `envelope.kind` / payload `entity_type`. NOT an
/// agent tool. One handler per plugin.
export function syncHandler(_surface?: string): MethodRecorder {
  return record("__sync__", { description: "sync ingest handler", params: {} }, false, false);
}

// ───────────────────── definePlugin — the entry ───────────────────
/// Single plugin entry point. Generic over the plugin's schema maps —
/// `F`/`C` are inferred from the constructor, so `definePlugin(Foo)`
/// needs no explicit type args and there is no `any` at the call site.
/// (The wire shape it publishes — PluginModuleShape / ToolDefinitionWire — is
/// declared in ./contract/module.)
export function definePlugin<
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
>(ModuleClass: new (deps: PluginDeps<F, C>) => object): void {
  // Handed to the runtime AT MODULE EVAL, then mutated in place by
  // init(); the runtime reads rpcHandlers only post-init, so the
  // empty-then-filled sequence is safe.
  const rpcHandlers: PluginModuleShape["rpcHandlers"] = {};
  const toolDefinitions: ToolDefinitionWire[] = [];

  // init has no async work of its own, but must stay async to satisfy
  // PluginModuleShape.init's Promise<void> contract AND preserve throw→rejection
  // semantics for the runtime's `await init(...)`.
  // eslint-disable-next-line @typescript-eslint/require-await -- see above
  async function init(
    graph: unknown,
    ctx: PluginContext,
    util: PluginUtil,
    rpc: RpcExecutor,
  ): Promise<void> {
    const instance = new ModuleClass({
      graph: graph as GraphService<F, C>,
      ctx,
      util,
      rpc,
    }) as Record<string, (p: unknown) => unknown>;
    // Prefix = the plugin id the runtime injects (== the module name,
    // per the Rust convention). The decorator carries only the suffix.
    const prefix = ctx.extension_id;
    const metas: ToolMeta[] = REGISTRY.get((ModuleClass as { prototype: object }).prototype) ?? [];
    for (const m of metas) {
      const rpcName = `${prefix}.${m.suffix}`;
      const method = instance[m.methodName];
      if (typeof method !== "function") {
        throw new Error(`plugin: decorated method "${m.methodName}" is not a function`);
      }
      rpcHandlers[rpcName] = (params: unknown): unknown => method.call(instance, params);
      // RPC-only handlers (rpc()) register the handler but are NOT harvested
      // as agent tools (DEC-14).
      if (m.isTool) {
        toolDefinitions.push({
          name: rpcName,
          description: m.description,
          inputSchema: m.params,
          requires_approval: m.write,
        });
      }
    }
  }

  (globalThis as unknown as { __magnis_plugin_module: PluginModuleShape }).__magnis_plugin_module = {
    init,
    rpcHandlers,
    toolDefinitions,
  };
}

// ── Lifecycle runtime (extensions-lifecycle Stage 4, spec docs/plugins/lifecycle.md §4.1)
// The hook/context/step types (LifecycleHooks, InstallContext, MigrationStep)
// live in ./contract/lifecycle.

/** Declare the package's lifecycle hooks. Runs the install hook immediately —
 * the transient install isolate exists only to execute it; the declaration is
 * published on a well-known global the host reads back. */
export function defineLifecycle(hooks: LifecycleHooks): void {
  let declared: unknown = null;
  const ctx: InstallContext = {
    registerManifestSchemas(): void {
      declared = "manifest";
    },
    register(registrations: { entities?: string[]; facets?: string[] }): void {
      declared = registrations;
    },
  };
  hooks.install(ctx);
  (globalThis as Record<string, unknown>).__magnis_lifecycle_install = declared;
}

/** Declare one data-migration ladder step (spec §4.2). Runs the step
 * immediately in the transient migrate isolate; on success the host bumps
 * `installed_extensions.version` to the step target in its own transaction —
 * a crash resumes from the last committed step. The step MUST be idempotent:
 * a crash between step success and the version bump re-runs it on the next
 * reconcile (idempotency is the recovery mechanism, as with install). */
export function defineMigration(step: MigrationStep): void {
  step();
  (globalThis as Record<string, unknown>).__magnis_lifecycle_migrate = "ok";
}
