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
  LinkSummary,
  MethodRecorder,
  PluginContext,
  PluginDeps,
  PluginLogger,
  PluginModuleShape,
  PluginUtil,
  RawEntity,
  RpcExecutor,
  SearchEntitiesPage,
  SearchEntitiesPageParams,
  SearchEntitiesParams,
  StandardMethodDecoratorContext,
  ToolDefinitionWire,
  ToolSpecInput,
} from "./contract/module";
import type { InstallContext, LifecycleHooks, MigrationStep } from "./contract/lifecycle";

// ── shared link-endpoint assembly (added 2026-08-12) ────────────────────────
// Every module that answers `linked_entities` has to turn edges into endpoints:
// take the far side of each edge, label it by direction, drop the node it was
// read from, and keep one row per endpoint. Seven modules hand-rolled that and
// four observable divergences followed — some labelled incoming edges with `~`
// and some did not, some deduplicated and some did not. This is the one
// implementation; WHICH edges to pass in stays each module's own decision,
// because that is the part that legitimately differs (a contact reads its
// replicas' edges, a message reads its own).
//
// Direction: an edge whose `from_id` is one of `ownerIds` is outgoing and keeps
// its kind; anything else is incoming and wears `~`. Passes are applied in
// order and the FIRST relation to reach an endpoint supplies its label, so a
// caller that reads its own edges before its replicas' gets its own labels.
export interface LinkEndpointPass {
  readonly links: readonly LinkSummary[];
  /** The nodes these edges were read from — `from_id` here means outgoing. */
  readonly ownerIds: ReadonlySet<string>;
}

export function reachedEndpoints(
  passes: readonly LinkEndpointPass[],
  excludeIds: ReadonlySet<string>,
): Map<string, string> {
  const reached = new Map<string, string>();
  for (const pass of passes) {
    for (const link of pass.links) {
      const outgoing = pass.ownerIds.has(link.from_id);
      const endpoint = outgoing ? link.to_id : link.from_id;
      if (excludeIds.has(endpoint)) continue;
      if (reached.has(endpoint)) continue;
      reached.set(endpoint, outgoing ? link.kind : `~${link.kind}`);
    }
  }
  return reached;
}

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
// plugin gets back from the graph (window-row `data`, `get_entity_full` record
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
/// Readable text for a thrown value. Domain-neutral, and it belongs here for
/// the same reason `str`/`num` do — the alternative is a copy per module.
/// It matters more than it looks: the host serialises a rejection as
/// `String(e.stack)`, and a stack carries neither `AggregateError.errors` nor
/// `.cause`, so anything the operator must see has to be IN the message.
export function errText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "unserialisable error";
  }
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
  methodName: string | symbol;
}

// Keyed by the class PROTOTYPE. Legacy TS decorators receive it directly;
// standard decorators register it from their instance initializer. A fresh
// instance has the same prototype, so definePlugin reads one canonical list.
const REGISTRY = new WeakMap<object, ToolMeta[]>();

function registerMethod(target: object, meta: ToolMeta): void {
  const list = REGISTRY.get(target);
  if (list === undefined) {
    REGISTRY.set(target, [meta]);
    return;
  }
  const alreadyRegistered = list.some(
    (entry) =>
      entry.methodName === meta.methodName &&
      entry.suffix === meta.suffix &&
      entry.write === meta.write &&
      entry.isTool === meta.isTool,
  );
  if (!alreadyRegistered) list.push(meta);
}

function record(suffix: string, spec: ToolSpecInput, write: boolean, isTool: boolean): MethodRecorder {
  function decorate(
    targetOrMethod: object,
    methodNameOrContext: string | symbol | StandardMethodDecoratorContext,
    _descriptor?: PropertyDescriptor,
  ): void {
    const common = {
      suffix,
      description: spec.description,
      params: spec.params,
      write,
      isTool,
    };
    if (
      typeof methodNameOrContext === "string" || typeof methodNameOrContext === "symbol"
    ) {
      registerMethod(targetOrMethod, { ...common, methodName: methodNameOrContext });
      return;
    }

    const context = methodNameOrContext;
    if (context.static || context.private) {
      throw new TypeError("plugin decorators require a public instance method");
    }
    context.addInitializer(function registerStandardDecorator(this: object): void {
      const prototype = Object.getPrototypeOf(this) as object | null;
      if (prototype === null) throw new TypeError("decorated plugin instance has no prototype");
      registerMethod(prototype, { ...common, methodName: context.name });
    });
  }
  return decorate;
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

/// S4: the terminal sync marker. Invoked once when a bootstrap drain
/// terminates — the page set the connector reported is COMPLETE, so an
/// identity-scoped module can reconcile it: what the source no longer
/// reports leaves the observed set. Payload: { user_id, source_id,
/// account_id, identity_key, observed_remote_ids }. Opt-in.
export function syncComplete(): MethodRecorder {
  return record(
    "__sync_complete__",
    { description: "sync complete hook", params: {} },
    false,
    false,
  );
}

/// S4: the connection-ready hook. Invoked by the host — user id from the
/// CONNECT payload, never from an envelope — the moment a connection becomes
/// provider-verified, BEFORE any envelope routes. The one place a module
/// mints what identity-scoped ingest presumes (telegram: the operator's own
/// account node). Payload: { user_id, source_id, account_id, identity_key }.
/// NOT an agent tool. Opt-in — a module without it has nothing to prepare.
export function connectionReady(): MethodRecorder {
  return record(
    "__connection_ready__",
    { description: "connection ready hook", params: {} },
    false,
    false,
  );
}

// ───────────────────── definePlugin — the entry ───────────────────
/// Single plugin entry point. Generic over the plugin's canonical map — `C`
/// is inferred from the constructor, so `definePlugin(Foo)` needs no explicit
/// type args and there is no `any` at the call site.
/// (The wire shape it publishes — PluginModuleShape / ToolDefinitionWire — is
/// declared in ./contract/module.)
export function definePlugin(
  ModuleClass: new (deps: PluginDeps) => object,
): void {
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
    log: PluginLogger,
  ): Promise<void> {
    // The host boundary is Rust/V8 and passes these positionally, so TypeScript
    // cannot enforce arity there. Without this guard a host that has not caught
    // up leaves `log` undefined, every handler registers, and the plugin runs
    // normally until a FAILURE path calls `deps.log` — crashing inside the
    // error handler. That is the swallow-the-failure shape this surface exists
    // to remove, so the contract is checked here instead of assumed.
    // @tested-by: tst_sdk_log_002
    if (typeof (log as PluginLogger | undefined)?.log !== "function") {
      throw new TypeError(
        "plugin init: host did not supply the logger (5th argument). " +
          "A plugin without a log channel cannot report its own failures.",
      );
    }
    const instance = new ModuleClass({
      graph: graph as GraphService,
      ctx,
      util,
      rpc,
      log,
    }) as Record<PropertyKey, unknown>;
    // Prefix = the plugin id the runtime injects (== the module name,
    // per the Rust convention). The decorator carries only the suffix.
    const prefix = ctx.extension_id;
    const metas: ToolMeta[] = REGISTRY.get((ModuleClass as { prototype: object }).prototype) ?? [];
    for (const m of metas) {
      const rpcName = `${prefix}.${m.suffix}`;
      const method = instance[m.methodName];
      if (typeof method !== "function") {
        throw new Error(`plugin: decorated method "${String(m.methodName)}" is not a function`);
      }
      rpcHandlers[rpcName] = (params: unknown): unknown => method.call(instance, params);
      // RPC-only handlers (rpc()) register the handler but are NOT harvested
      // as agent tools.
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

// ── Lifecycle runtime
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
    register(registrations: { entities?: string[] }): void {
      declared = registrations;
    },
  };
  hooks.install(ctx);
  (globalThis as Record<string, unknown>).__magnis_lifecycle_install = declared;
}

/** Declare one data-migration ladder step. Runs the step
 * immediately in the transient migrate isolate; on success the host bumps
 * `installed_extensions.version` to the step target in its own transaction —
 * a crash resumes from the last committed step. The step MUST be idempotent:
 * a crash between step success and the version bump re-runs it on the next
 * reconcile (idempotency is the recovery mechanism, as with install). */
export function defineMigration(step: MigrationStep): void {
  step();
  (globalThis as Record<string, unknown>).__magnis_lifecycle_migrate = "ok";
}
