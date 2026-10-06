// ═══════════════════════════ MODULE CONTRACT ═══════════════════════════
//
// Idiom: a module is a decorator-declared class + config. You implement a
// class, decorate its methods with @tool/@writeTool/@rpc/@syncHandler, and pass
// it to `definePlugin`. (Contrast: a source is a plain config object; a
// lifecycle is a set of hooks.)
//
// What a module is: a module OWNS a schema namespace and declares its surface
// with the `@tool/@writeTool/@rpc/@syncHandler` decorators; the host provides
// `GraphService` + `PluginDeps` per dispatch. Implement a class, decorate its
// methods, pass it to `definePlugin`.
//
// This file is PURE TYPES — zero runtime. The decorators (`tool`/`writeTool`/
// `rpc`/`syncHandler`), `definePlugin`, and the `searchEntitiesPage` helper live
// in `../index.ts` and import their types from here. Every name below is
// re-exported from `@magnis/plugin-sdk`, so this move changes no consumer.

// ───────────────────────── SDK shapes ─────────────────────
// Every shape the host and a plugin exchange is declared once, in the SDK, and
// arrives here type-only through `@magnis/host-stubs`. A module imports them
// from `@magnis/sdk`; nothing below repeats one.
import type {
  AccountSyncState,
  AddLinkParams,
  AdmitSyncEntitiesResult,
  AllowlistGate,
  CreateEntityParams,
  Entity,
  EntityWithLinks,
  FileRegisterParams,
  GraphBatchInput,
  GraphBatchResult,
  JsonObject,
  JsonValue,
  Link,
  LinkedEntity,
  LinkedSpec,
  ListEntitiesByPropertyFieldParams,
  ListEntitiesParams,
  ListSyncMigrationEntitiesParams,
  ListSyncMigrationEntitiesResult,
  MergeInput,
  MergePreview,
  MergeResult,
  ModuleSettingsResult,
  PaginatedResponse,
  PluginContext,
  PluginRpcDeclaration,
  PluginToolDeclaration,
  PropertiesUpdate,
  SearchEntitiesParams,
  SetSyncEnabledParams,
  SyncAdmissionSubject,
  SyncStateApplyResult,
  SyncStateResetResult,
  SyncStateStatusResult,
  UpdateEntitySyncEnabledResult,
  WebRegisterParams,
  WindowSpec,
} from "@magnis/sdk";

// ───────────────────────── RPC contract types ─────────────────────
/// Standard `<module>.list` RPC input.
export interface ListParams {
  limit?: number;
  offset?: number;
  search?: string;
}

/// Standard `<module>.get` RPC input.
export interface GetParams {
  id: string;
}

// ───────────────────────── entity synchronization ─────────────────────
// A schema that supports synchronization carries the user's saved choice on
// each entity: `syncEnabled` and the graph-owned decimal `syncRevision`
// (the SDK's `Syncable`). The choice shapes the host reads — `SyncChoice`,
// `SyncSelection`, `SyncSelectionRequest`, `SyncMigrationEntity` — are SDK
// shapes. The ones below are module-owned: the `setSyncEnabled`,
// `syncMigration` and `resolveSyncMigration` methods modules answer each
// other and their UIs.

export type SyncTargetResult =
  | {
      identityId: string;
      targetId: string;
      kind: "saved";
      syncEnabled: boolean;
      syncRevision: string;
      application: Exclude<NonNullable<AccountSyncState["syncApplication"]>, { kind: "applied" }>;
    }
  | {
      identityId: string;
      targetId: string | null;
      kind: "failed";
      message: string;
    };

export interface SetSyncEnabledResult {
  results: readonly SyncTargetResult[];
}

export interface SyncMigrationTarget {
  schemaId: "telegram.chat" | "email.address" | "x.profile";
  key: string;
}

export interface SyncMigrationIssue {
  target: SyncMigrationTarget | null;
  legacyIds: readonly string[];
  accounts: readonly {
    accountId: string;
    syncEnabled: boolean;
  }[];
  message: string;
}

export interface SyncMigrationStatus {
  complete: boolean;
  issues: readonly SyncMigrationIssue[];
}

export interface ResolveSyncMigrationParams {
  target: SyncMigrationTarget;
  syncEnabled: boolean;
}

// ── shared list-search paging (added 2026-07-03) ────────────────────────────
// The `searchEntitiesPage` helper (runtime, in ../index.ts) consumes these and
// answers a `PaginatedResponse<Entity>`. The host list pane pages via
// {limit, offset, search} and computes hasMore = items.length < total.
export interface SearchEntitiesPageParams {
  query: string;
  schemaId: string;
  limit: number;
  offset: number;
  /** Optional visibility filter (e.g. contacts' group-tier hiding). The helper
   * re-fetches with a growing window until the page (+1) is filled with
   * SURVIVORS or the source is exhausted — filtering never truncates totals. */
  filter?: (entities: Entity[]) => Promise<Entity[]>;
}

/** The largest page the host serves; a larger `limit` is refused. */
export const pageLimitMax = 200;

/// The host graph, injected into each plugin module. Operation names stay
/// flat snake_case; every input and answer is an SDK shape. The user and the
/// actor are stamped host-side from the plugin context, never supplied by JS.
///
/// Not parameterised: a node's dictionary is JSON, and a module types it with
/// its own interface at the call sites that care.
export interface GraphService {
  updateEntitySyncEnabled(params: SetSyncEnabledParams): Promise<UpdateEntitySyncEnabledResult>;
  admitSyncEntities(subjects: readonly SyncAdmissionSubject[], controlRemoteIds?: readonly string[]): Promise<AdmitSyncEntitiesResult>;
  moduleSettings(forSchema?: string): Promise<ModuleSettingsResult>;
  /** `limit` is 1 to `pageLimitMax`. */
  listSyncMigrationEntities(params: ListSyncMigrationEntitiesParams): Promise<ListSyncMigrationEntitiesResult>;
  // All reads are user-scoped host-side.
  createEntity(p: CreateEntityParams): Promise<Entity>;
  getEntity(id: string): Promise<Entity | null>;
  listEntities(p: ListEntitiesParams): Promise<PaginatedResponse<Entity>>;
  // Windowed list with the exact total, in one statement. Filter/order over
  // entity columns or dictionary keys.
  listEntitiesWindow(p: WindowSpec): Promise<PaginatedResponse<Entity>>;
  // One entity (dictionary included) + its links, user-scoped (null for a
  // non-owner).
  getEntityFull(id: string, opts?: { links?: boolean }): Promise<EntityWithLinks | null>;
  // A parent's neighbors over a typed link, with the link.
  listLinked(p: LinkedSpec): Promise<PaginatedResponse<LinkedEntity>>;
  // Batch: resolve a set of entity ids in one statement, user-scoped, in
  // input order.
  getEntities(ids: string[]): Promise<Entity[]>;
  // user-scoped; omit/empty context = all of the user's entities.
  listEntitiesByContext(context?: string): Promise<Entity[]>;
  searchEntitiesByName(p: SearchEntitiesParams): Promise<Entity[]>;
  /** Resolve a node by its `source.externalId`. */
  findByExternalId(externalId: string): Promise<string | null>;
  /** Plural resolution in one host call: input order kept, null where absent. */
  findByExternalIds(externalIds: string[]): Promise<(string | null)[]>;
  // register a web link (web.link entity + dictionary + bg preview fetch),
  // optionally linked to a parent entity. Returns the web.link entity id.
  webRegister(p: WebRegisterParams): Promise<string>;
  // register a downloadable media file (find-or-create file.object entity +
  // parent link + background download). mimeType is computed plugin-side so
  // the op stays source-agnostic. Returns the file.object entity id.
  fileRegister(p: FileRegisterParams): Promise<string>;
  /** Batch: every URL a page carries, in ONE host call. Input order is kept;
   *  each position holds that URL's `web.link` entity id, or `""` where the
   *  host could not normalize the URL — one bad URL costs its own row and
   *  never aborts the page. Capability is checked once, before any write. */
  webRegisterBatch(links: WebRegisterParams[]): Promise<string[]>;
  /** Batch: every attachment a page carries, in ONE host call. Input order is
   *  kept; each position holds that file's `file.object` entity id. There is
   *  no empty sentinel: a row the host did not write is an error. One row
   *  whose `linkKind` is not `file.attachment`, or whose `sourceRef` does
   *  not match the admitted worker, refuses the WHOLE call. The same
   *  attachment twice in one page accumulates, as two calls would. */
  fileRegisterBatch(files: FileRegisterParams[]): Promise<string[]>;
  /** Batch: merge a dictionary patch into each node, in ONE host call. Each
   *  patch MERGES — a field it does not name keeps its value — and the same
   *  node twice accumulates. The capability for every row's schema is checked
   *  before any row is written; one refused row refuses the whole call. */
  updatePropertiesBatch(updates: PropertiesUpdate[]): Promise<void>;
  // route an Execute SourceCommand to this plugin's source (send/reply/backfill)
  // via the host SyncRouter. Returns the source runtime's JSON result.
  sourceCommand(payload: Record<string, unknown>, accountId?: string): Promise<Record<string, unknown>>;
  // Like sourceCommand, but FIRE-AND-FORGET: the (slow, network-bound) connector
  // fetch + ingest run as a detached host task, so the plugin's single worker
  // channel is not blocked. Returns immediately ({pending:true}); the page lands
  // asynchronously and the host emits `sync.backfill` so the UI can re-fetch.
  requestBackfill(payload: Record<string, unknown>, accountId?: string): Promise<{ pending: boolean }>;
  // sync control, keyed by the calling module (not telegram). "status" lists the
  // caller's sync states; "reset" deletes the caller's entities of `resetSchema`
  // (which MUST be in the caller's own namespace) and resets sync state. Overloads
  // make `reset` REQUIRE the schema — `syncState("reset")` is a compile error, so
  // a plugin can't trip the host's namespace guard at runtime.
  syncState(action: "status"): Promise<SyncStateStatusResult>;
  syncState(action: "reset", resetSchema: string): Promise<SyncStateResetResult>;
  syncState(action: "apply"): Promise<SyncStateApplyResult>;
  // reply-composer presence: op "read" | "set_text" | "append_text". read
  // reports presence; set_text/append_text gate+bump the revision and publish.
  composer(
    op: string,
    threadKey?: string,
    text?: string,
    attachmentIds?: string[],
  ): Promise<Record<string, unknown>>;
  updateEntityName(id: string, name: string): Promise<void>;
  updateEntityIdx(id: string, idx: string | null): Promise<void>;
  deleteEntity(id: string): Promise<void>;

  /// S1 (canonical-graph-structure): write the node's dictionary — the
  /// property-graph write path. The host validates ownership (user +
  /// namespace) and an update un-archives.
  updateProperties(p: PropertiesUpdate): Promise<void>;
  /// S1: filter a FOLDED family's entities by a top-level dictionary key,
  /// user-scoped natively. Returns the page and the exact total.
  listEntitiesByPropertyField(p: ListEntitiesByPropertyFieldParams): Promise<PaginatedResponse<Entity>>;
  addLink(p: AddLinkParams): Promise<void>;
  deleteLink(id: string): Promise<void>;
  /** The link's fact stopped being true at `validUntil`; the row stays, and
   * reads that keep history still see it. One-way — there is no reopen. */
  endLink(id: string, validUntil: string): Promise<void>;
  /** The entity's links, ended ones included — an open link reads
   * `validUntil === null`. */
  listLinksForEntity(entityId: string, linkKind?: string): Promise<Link[]>;
  /** S6 batch: every canonical link of MANY entities in ONE round-trip. Each
   * row carries `from`/`to`, so the caller groups. A page whose cards read
   * their neighbours off the links uses this, never a per-row read. */
  listLinksForEntities(entityIds: string[]): Promise<Link[]>;

  // batch — apply a whole graph fragment (entities + refs + links) in ONE
  // atomic transaction / one host crossing. The bulk ingest primitive: a page
  // of N messages becomes one call instead of ~3N create/link ops. Entities
  // are keyed by LOCAL `key`s (links/refs wire by key); the `externalId` is
  // the idempotency identity (resolve-or-create).
  applyBatch(batch: GraphBatchInput): Promise<GraphBatchResult>;

  // merge — backed by GraphService::mergeExecute, not composed.
  mergePreview(p: Pick<MergeInput, "survivorId" | "retiredId">): Promise<MergePreview>;
  mergeExecute(p: Omit<MergeInput, "preview">): Promise<MergeResult>;
}

/// Pure, stateless host utilities (no graph/capability surface).
export interface PluginUtil {
  /// Deterministic UUIDv5 — byte-for-byte equal to Rust `Uuid::new_v5`,
  /// for id derivation that must match native handlers (e.g.
  /// contacts.batch_create per-row idempotency keys).
  uuid_v5(namespace: string, name: string): Promise<string>;
}

/// Cross-module RPC hub. `execute` calls another module's RPC
/// method over the host router. Allowed targets are declared in the
/// manifest `[permissions]` `call` list, including calls to other plugins.
export interface RpcExecutor {
  execute<T = unknown>(method: string, params?: unknown): Promise<T>;
}

/// Severity of a plugin log entry. Mirrors the host's `LogLevel` so an entry
/// crosses the boundary without translation.
export type PluginLogLevel = "debug" | "info" | "warn" | "error";

/// The plugin's channel into the host logger. Entries are recorded under the
/// module's own origin, so a plugin failure is attributable without reading
/// process stdout.
///
/// Log at operational branches and failure paths — a send that was rejected, a
/// trigger that was skipped and why, a write that was rolled back. Do not log
/// presentation or prompt text.
export interface PluginLogger {
  log(level: PluginLogLevel, message: string, fields?: Record<string, unknown>): Promise<void>;
}

export interface PluginDeps {
  graph: GraphService;
  ctx: PluginContext;
  util: PluginUtil;
  rpc: RpcExecutor;
  log: PluginLogger;
}

// ─────────────────── tool metadata + decorator specs ───────────────────
// The authoring surface: a plugin decorates its class methods with
// `@tool/@writeTool/@rpc/@syncHandler` (runtime in ../index.ts). These types
// describe what those decorators consume and produce.

/// The spec object each `@tool/@writeTool/@rpc` decorator takes: the agent-facing
/// description + the JSON-schema `params` for the method's input.
export interface ToolSpecInput {
  entity: string;
  allowlistGate?: AllowlistGate;
  description: string;
  params: JsonObject;
}

/** The standard decorator context Bun supplies when it executes TypeScript
 * directly. Packaged modules still use the legacy decorator ABI, so the
 * runtime recorder deliberately accepts both exact call shapes. */
export interface StandardMethodDecoratorContext {
  readonly kind: "method";
  readonly name: string | symbol;
  readonly static: boolean;
  readonly private: boolean;
  addInitializer(initializer: (this: object) => void): void;
}

/** Method decorator returned by the tool factories. TypeScript builds invoke
 * the legacy overload; Bun's direct TypeScript execution invokes the standard
 * overload. Both record the same method metadata. Public instance methods are
 * inherited base-to-derived; publishing two decorators with one suffix anywhere
 * in that chain is rejected as ambiguous. Static and private methods are never
 * valid plugin handlers. */
export interface MethodRecorder {
  (target: object, methodName: string | symbol, descriptor: PropertyDescriptor): void;
  (method: object, context: StandardMethodDecoratorContext): void;
}

/** Decorator for a host-invoked hook. It records the method as
 * `MethodRecorder` does, and its type holds the method to what the host sends
 * and reads back, so a handler that drifts from the SDK shape does not compile. */
export interface HookRecorder<Params, Answer> {
  (
    target: object,
    methodName: string | symbol,
    descriptor: TypedPropertyDescriptor<(params: Params) => Promise<Answer>>,
  ): void;
  (method: (params: Params) => Promise<Answer>, context: StandardMethodDecoratorContext): void;
}

/// The shape `definePlugin` publishes on the well-known global for the host
/// runtime: a lazy `init` (wires the decorated instance), the post-init RPC
/// handler table, the harvested agent tools and the rpc() methods the host
/// registers with their input schemas.
export interface PluginModuleShape {
  /// The host supplies every dependency positionally. `log` is REQUIRED: a
  /// host that does not pass it leaves modules unable to report failures, so
  /// this is a deliberate breaking change rather than an optional argument
  /// defaulted to a no-op sink (which would silently swallow diagnostics).
  /// The host side lands together with the submodule bump.
  init: (
    graph: unknown,
    ctx: PluginContext,
    util: PluginUtil,
    rpc: RpcExecutor,
    log: PluginLogger,
  ) => Promise<void>;
  rpcHandlers: Record<string, (params: JsonValue) => unknown>;
  toolDefinitions: PluginToolDeclaration[];
  rpcDeclarations: PluginRpcDeclaration[];
}
