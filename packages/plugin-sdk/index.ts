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
  Entity,
  EntityRead,
  PersistentEntity,
  JsonObject,
  JsonValue,
  Link,
  LinkedEntitySummary,
  PaginatedResponse,
  PluginContext,
  SyncHandlerParams,
  SyncHookParams,
  SyncReceipt,
  SyncReconcileAnswer,
} from "@magnis/sdk";
import type {
  GraphService,
  HookRecorder,
  MethodRecorder,
  PluginDeps,
  PluginLogger,
  PluginModuleShape,
  PluginUtil,
  RpcExecutor,
  SearchEntitiesPageParams,
  StandardMethodDecoratorContext,
  ToolSpecInput,
} from "./contract/module";
import type { InstallContext, LifecycleHooks, MigrationStep } from "./contract/lifecycle";

// ── shared link-endpoint assembly (added 2026-08-12) ────────────────────────
// Every module that answers `linkedEntities` has to turn edges into endpoints:
// take the far side of each edge, label it by direction, drop the node it was
// read from, and keep one row per endpoint. Seven modules hand-rolled that and
// four observable divergences followed — some labelled incoming edges with `~`
// and some did not, some deduplicated and some did not. This is the one
// implementation; WHICH edges to pass in stays each module's own decision,
// because that is the part that legitimately differs (a contact reads its
// replicas' edges, a message reads its own).
//
// Direction: an edge whose `from` is one of `ownerIds` is outgoing and keeps
// its kind; anything else is incoming and wears `~`. Passes are applied in
// order and the FIRST relation to reach an endpoint supplies its label, so a
// caller that reads its own edges before its replicas' gets its own labels.
export interface LinkEndpointPass {
  readonly links: readonly Link[];
  /** The nodes these edges were read from — `from` here means outgoing. */
  readonly ownerIds: ReadonlySet<string>;
}

/** The link that first reached an endpoint, and the label it gives it. */
export interface ReachedEndpoint {
  readonly link: Link;
  readonly linkKind: string;
}

export function reachedEndpoints(
  passes: readonly LinkEndpointPass[],
  excludeIds: ReadonlySet<string>,
): Map<string, ReachedEndpoint> {
  const reached = new Map<string, ReachedEndpoint>();
  for (const pass of passes) {
    for (const link of pass.links) {
      const outgoing = pass.ownerIds.has(link.from);
      const endpoint = outgoing ? link.to : link.from;
      if (excludeIds.has(endpoint)) continue;
      if (reached.has(endpoint)) continue;
      reached.set(endpoint, { link, linkKind: outgoing ? link.kind : `~${link.kind}` });
    }
  }
  return reached;
}

/** One endpoint as a module's detail lists it: the endpoint entity, labelled
 * `linkKind`, with the statement of the link that reached it — an agent link
 * says how sure it is, and an ended one says when it ended. */
export function linkedEntitySummary(entity: Entity, link: Link, _linkKind: string): LinkedEntitySummary {
  return {
    id: entity.id,
    name: entity.name,
    schemaId: entity.schemaId,
    linkKind: link.kind,
    direction: link.to === entity.id ? "out" : "in",
    createdAt: entity.createdAt,
    origin: link.origin,
    confidence: link.origin === "derived" ? link.confidence : null,
    validUntil: link.validUntil,
  };
}

// ── shared list-search paging (added 2026-07-03) ────────────────────────────
// The host list pane pages via {limit, offset, search} and computes
// hasMore = items.length < total. A search implementation that fetches only
// limit+offset rows truncates `total` to the visible window and KILLS infinite
// scroll (live bug: contacts pattern copied into x/linkedin). This helper is
// the one correct implementation: overfetch by ONE row past the window so
// `total` exceeds the shown page exactly while more matches exist.
// (Param type: SearchEntitiesPageParams in ./contract/module.)
export function searchEntitiesPage(
  graph: Pick<GraphService, "searchEntitiesByName">,
  p: SearchEntitiesPageParams<EntityRead> & { extras: true },
): Promise<PaginatedResponse<EntityRead>>;
export function searchEntitiesPage(
  graph: Pick<GraphService, "searchEntitiesByName">,
  p: SearchEntitiesPageParams & { extras?: undefined },
): Promise<PaginatedResponse<PersistentEntity>>;
export function searchEntitiesPage(
  graph: Pick<GraphService, "searchEntitiesByName">,
  p: (SearchEntitiesPageParams<EntityRead> & { extras: true }) | (SearchEntitiesPageParams & { extras?: undefined }),
): Promise<PaginatedResponse<PersistentEntity> | PaginatedResponse<EntityRead>> {
  const params = { query: p.query, schemaIds: [p.schemaId] };
  return p.extras === true
    ? searchPage((limit) => graph.searchEntitiesByName({ ...params, limit, extras: true }), p)
    : searchPage((limit) => graph.searchEntitiesByName({ ...params, limit }), p);
}

async function searchPage<T>(find: (limit: number) => Promise<T[]>, p: SearchEntitiesPageParams<T>): Promise<PaginatedResponse<T>> {
  // NO client-side re-sort: the backend order is a stable TOTAL order
  // (prefix-match first, date DESC, id), so top-N windows are consistent
  // prefixes across pages. Re-sorting different overfetch windows makes pages
  // disagree (overlap + missing rows) and the merged list stalls mid-scroll.
  const needed = p.offset + p.limit + 1;
  let fetchLimit = needed;
  for (;;) {
    const found = await find(fetchLimit);
    const kept = p.filter ? await p.filter(found) : found;
    // Done when the page (+1 for an honest hasMore) is filled with SURVIVORS,
    // or the source is exhausted (returned fewer than asked). Otherwise the
    // filter ate rows — grow the window and refetch (≤log₂ rounds).
    if (kept.length >= needed || found.length < fetchLimit) {
      return { items: kept.slice(p.offset, p.offset + p.limit), total: kept.length, limit: p.limit, offset: p.offset };
    }
    fetchLimit *= 2;
  }
}

/** Only this account's source replicas left unseen by a completed pass. */
export async function unseenSourceReplicas(
  graph: GraphService,
  schemaId: string,
  sourceId: string,
  accountId: string,
  generation: string,
): Promise<Entity[]> {
  const rows: Entity[] = [];
  for (let offset = 0;; offset += 500) {
    const page = await graph.listEntitiesByPropertyField({
      entitySchema: schemaId, key: "account_id", value: accountId, limit: 500, offset,
    });
    rows.push(...page.items);
    if (offset + page.items.length >= page.total) break;
  }
  return rows.filter((row) => {
    const properties = row.properties;
    if (row.schemaId !== schemaId || properties === null || typeof properties !== "object" || Array.isArray(properties)) return false;
    return properties.source_id === sourceId && properties.account_id === accountId && properties.sync_pass !== generation;
  });
}

/** Remove only this account's source replicas left unseen by a completed pass. */
export async function removeUnseenSourceReplicas(
  graph: GraphService,
  schemaId: string,
  sourceId: string,
  accountId: string,
  generation: string,
): Promise<void> {
  for (const row of await unseenSourceReplicas(graph, schemaId, sourceId, accountId, generation)) {
    await graph.deleteEntity(row.id);
  }
}

// ─────────────────── payload coercion helpers ──────────────────────────────
// Domain-neutral readers for the opaque `Record<string, unknown>` maps every
// plugin gets back from the graph (window-row `data`, `getEntityFull` record
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
// The decorator SPEC types (ToolSpecInput, MethodRecorder, HookRecorder,
// PluginModuleShape) live in ./contract/module. ToolMeta is the internal
// registry record — an implementation detail of this runtime, not contract.
interface ToolMeta {
  suffix: string;
  entity: string | null;
  gate: ToolSpecInput["allowlistGate"];
  description: string;
  params: JsonObject;
  write: boolean;
  /// "tool": an agent tool, also reachable over RPC. "rpc": an RPC-only
  /// method, published as a plugin RPC declaration (see `rpc()`). "hook": a
  /// method only the host invokes, such as `__sync__`.
  kind: "tool" | "rpc" | "hook";
  methodName: string | symbol;
}

// Legacy TS decorators receive the declaring prototype. Standard decorators
// receive only the decorated method function, so their metadata is keyed by
// that function at class-definition time. definePlugin joins both registries
// by walking own method descriptors from the base prototype to the leaf.
const LEGACY_REGISTRY = new WeakMap<object, ToolMeta[]>();
const STANDARD_REGISTRY = new WeakMap<object, ToolMeta[]>();

function registerMethod(
  registry: WeakMap<object, ToolMeta[]>,
  target: object,
  meta: ToolMeta,
): void {
  const list = registry.get(target);
  if (list === undefined) {
    registry.set(target, [meta]);
    return;
  }
  if (list.some((entry) => methodIdentity(entry) === methodIdentity(meta))) {
    throw new TypeError(`duplicate plugin operation ${JSON.stringify(methodIdentity(meta))}`);
  }
  list.push(meta);
}

function methodIdentity(meta: ToolMeta): string {
  return meta.entity === null ? meta.suffix : `${meta.entity}.${meta.suffix}`;
}

function collectMethodMetadata(prototype: object): ToolMeta[] {
  const chain: object[] = [];
  let cursor: object | null = prototype;
  while (cursor !== null && cursor !== Object.prototype) {
    chain.unshift(cursor);
    cursor = Object.getPrototypeOf(cursor) as object | null;
  }

  const collected: ToolMeta[] = [];
  const suffixes = new Set<string>();
  for (const owner of chain) {
    const legacy = LEGACY_REGISTRY.get(owner) ?? [];
    const visitedLegacy = new Set<ToolMeta>();
    const ownerMetas: ToolMeta[] = [];
    for (const methodName of Reflect.ownKeys(owner)) {
      if (methodName === "constructor") continue;
      for (const meta of legacy) {
        if (meta.methodName === methodName) {
          visitedLegacy.add(meta);
          ownerMetas.push(meta);
        }
      }
      const descriptor = Object.getOwnPropertyDescriptor(owner, methodName);
      const method: unknown = descriptor?.value;
      if (typeof method === "function") {
        ownerMetas.push(...(STANDARD_REGISTRY.get(method) ?? []));
      }
    }
    // A valid legacy method is always an own prototype descriptor. Preserve
    // the former validation path for malformed manual decorator calls so init
    // reports the missing/non-callable method instead of silently omitting it.
    for (const meta of legacy) {
      if (!visitedLegacy.has(meta)) ownerMetas.push(meta);
    }
    for (const meta of ownerMetas) {
      if (suffixes.has(methodIdentity(meta))) {
        throw new TypeError(`duplicate inherited plugin operation ${JSON.stringify(methodIdentity(meta))}`);
      }
      suffixes.add(methodIdentity(meta));
      collected.push(meta);
    }
  }
  return collected;
}

function record(suffix: string, spec: Omit<ToolSpecInput, "entity">, write: boolean, kind: ToolMeta["kind"], entity: string | null): MethodRecorder {
  function decorate(
    targetOrMethod: object,
    methodNameOrContext: string | symbol | StandardMethodDecoratorContext,
    _descriptor?: PropertyDescriptor,
  ): void {
    const common = {
      suffix,
      entity,
      gate: spec.allowlistGate,
      description: spec.description,
      params: spec.params,
      write,
      kind,
    };
    if (
      typeof methodNameOrContext === "string" || typeof methodNameOrContext === "symbol"
    ) {
      if (typeof targetOrMethod === "function") {
        throw new TypeError("plugin decorators require a public instance method");
      }
      registerMethod(LEGACY_REGISTRY, targetOrMethod, {
        ...common,
        methodName: methodNameOrContext,
      });
      return;
    }

    const context = methodNameOrContext;
    if (context.static || context.private) {
      throw new TypeError("plugin decorators require a public instance method");
    }
    registerMethod(STANDARD_REGISTRY, targetOrMethod, {
      ...common,
      methodName: context.name,
    });
  }
  return decorate;
}

/// Declare a read tool. `suffix` is the method name only — the backend
/// glues the `<plugin_id>.` prefix at init.
export function tool(suffix: string, spec: ToolSpecInput): MethodRecorder {
  return record(suffix, spec, false, "tool", spec.entity);
}
/// Declare a write tool (→ `requiresApproval: true` on the agent
/// tool declaration).
export function writeTool(suffix: string, spec: ToolSpecInput): MethodRecorder {
  return record(suffix, spec, true, "tool", spec.entity);
}
/// Declare an RPC-only handler: reachable via RPC (frontend / other
/// modules over the hub) but NOT exposed to the agent as a tool. Use for
/// internal/UI operations (e.g. add_member, list_for_entity) that the
/// agent shouldn't call directly. Its `params` schema is published as a
/// plugin RPC declaration, so the host parses the input before the handler
/// runs.
export function rpc(suffix: string, spec: Omit<ToolSpecInput, "entity">): MethodRecorder {
  return record(suffix, spec, false, "rpc", null);
}

/// Declare the plugin's sync ingest handler. The host `PluginModuleController`
/// bridge invokes it via the reserved `<plugin_id>.__sync__` method with a
/// `SyncHandlerParams` — a whole page of `SyncEnvelope`s — whenever a sync
/// envelope routes to one of the plugin's declared `surfaces.sync_handlers`,
/// and reads its `SyncReceipt`. The method dispatches internally by
/// `envelope.kind` / payload `entity_type`. NOT an agent tool. One handler per
/// plugin.
export function syncHandler(_surface?: string): HookRecorder<SyncHandlerParams, SyncReceipt> {
  return record("__sync__", { description: "sync ingest handler", params: {} }, false, "hook", null);
}

/// S4: the terminal sync marker. Invoked once with a `SyncHookParams`, its
/// `generation` set, when a bootstrap drain terminates — the page set the
/// connector reported is COMPLETE, so an identity-scoped module can reconcile
/// it: what the source no longer reports leaves the observed set. Answers a
/// `SyncReconcileAnswer`. Opt-in.
export function syncComplete(): HookRecorder<SyncHookParams, SyncReconcileAnswer> {
  return record(
    "__sync_complete__",
    { description: "sync complete hook", params: {} },
    false,
    "hook",
    null,
  );
}

/// S4: the connection-ready hook. Invoked by the host with a `SyncHookParams`
/// — user id from the CONNECT payload, never from an envelope, and no
/// generation — the moment a connection becomes provider-verified, BEFORE any
/// envelope routes. The one place a module mints what identity-scoped ingest
/// presumes (telegram: the operator's own account node). The host reads no
/// answer. NOT an agent tool. Opt-in — a module without it has nothing to
/// prepare.
export function connectionReady(): HookRecorder<SyncHookParams, void> {
  return record(
    "__connection_ready__",
    { description: "connection ready hook", params: {} },
    false,
    "hook",
    null,
  );
}

// ───────────────────── definePlugin — the entry ───────────────────
/// Single plugin entry point. Generic over the plugin's canonical map — `C`
/// is inferred from the constructor, so `definePlugin(Foo)` needs no explicit
/// type args and there is no `any` at the call site.
/// (The shape it publishes — PluginModuleShape — is declared in
/// ./contract/module.)
export function definePlugin(
  ModuleClass: new (deps: PluginDeps) => object,
): void {
  // Handed to the runtime AT MODULE EVAL, then mutated in place by
  // init(); the runtime reads rpcHandlers only post-init, so the
  // empty-then-filled sequence is safe.
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
    // Validate a complete candidate before replacing the active surface.
    // @tested-by: tst_testkit_entity_operations_002
    const rpcHandlers: PluginModuleShape["rpcHandlers"] = {};
    const toolDefinitions: PluginModuleShape["toolDefinitions"] = [];
    const rpcDeclarations: PluginModuleShape["rpcDeclarations"] = [];
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
    const prefix = ctx.extensionId;
    // Base handlers are inherited in declaration order. A repeated suffix is
    // ambiguous and fails rather than silently choosing an ABI or subclass.
    // @tested-by: tst_testkit_mount_dispatch_005
    const metas = collectMethodMetadata((ModuleClass as { prototype: object }).prototype);
    for (const m of metas) {
      if (m.kind === "tool" && (typeof m.entity !== "string" || !m.entity.startsWith(`${prefix}.`) || !/^[a-z][a-zA-Z0-9_]*$/.test(m.suffix))) {
        throw new TypeError(`plugin ${prefix} cannot register ${methodIdentity(m)}`);
      }
      const rpcName = m.kind === "tool" ? methodIdentity(m) : `${prefix}.${m.suffix}`;
      if (Object.hasOwn(rpcHandlers, rpcName)) throw new TypeError(`duplicate plugin handler ${rpcName}`);
      const method = instance[m.methodName];
      if (typeof method !== "function") {
        throw new Error(`plugin: decorated method "${String(m.methodName)}" is not a function`);
      }
      rpcHandlers[rpcName] = (params: JsonValue): unknown => method.call(instance, params);
      // An agent tool is harvested as a tool declaration; an rpc() method is
      // published with its params schema; a hook is neither.
      if (m.kind === "tool" && m.entity !== null) {
        toolDefinitions.push({
          name: rpcName,
          binding: { entity: m.entity, operation: m.suffix },
          ...(m.gate === undefined ? {} : { allowlistGate: m.gate }),
          description: m.description,
          inputSchema: m.params,
          requiresApproval: m.write,
        });
      }
      if (m.kind === "rpc") {
        rpcDeclarations.push({ name: rpcName, description: m.description, params: m.params });
      }
    }
    shape.rpcHandlers = rpcHandlers;
    shape.toolDefinitions = toolDefinitions;
    shape.rpcDeclarations = rpcDeclarations;
  }

  const shape: PluginModuleShape = {
    init,
    rpcHandlers: {},
    toolDefinitions: [],
    rpcDeclarations: [],
  };
  (globalThis as unknown as { __magnis_plugin_module: PluginModuleShape }).__magnis_plugin_module = shape;
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
