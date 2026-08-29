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

/// Standard `<module>.list` RPC envelope.
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ──────────────── injected backend service — mirrors Rust ──────────
export interface RawEntity {
  id: string;
  schema_id: string;
  name: string;
  // Always emitted by the host entity serializer (RFC3339). Optional in
  // the type because not every consumer needs it.
  created_at?: string;
  // The host serializes `Option<bool>` as `null` when unset (core/entity.rs)
  // — the wire carries boolean | null, never just absence.
  is_pinned?: boolean | null;
  // Additive: index-backed columns some lists render/sort by.
  date?: string | null;
  idx?: string | null;
  /// S1: the node's dictionary. Present on every entity the host serializes;
  /// `{}` for entities whose family has not folded yet.
  properties?: Record<string, unknown>;
  /// S1: identity anchor (null until the family's backfill).
  anchor?: string | null;
}

export interface CreateEntityParams {
  schema_id: string;
  name: string;
  // caller-supplied entity UUID (local-first optimistic create). The
  // backend uses it as the entity id; collision → Conflict; omit →
  // backend allocates. Mirrors Rust CreateEntityCommand.client_id.
  client_id?: string;
  // sort key (Rust CreateEntityCommand.idx). Contacts set it to the
  // lowercased name so list order ("idx") is alphabetical; omit →
  // backend leaves it null.
  idx?: string;
  // explicit entity date (RFC3339, Rust CreateEntityCommand.date). Telegram
  // messages set it to the message date so the chat index
  // entities(schema_id, idx, date DESC) orders them; omit → backend defaults.
  date?: string;
}
export interface ListEntitiesParams {
  schema_id: string;
  limit?: number;
  offset?: number;
  order?: "idx" | "date";
  show_archived?: boolean;
}
export interface SearchEntitiesParams {
  query: string;
  schema_ids?: string[];
  limit?: number;
}
/// A filter/order field for `list_entities_window` (a FieldRef): an entity
/// column, a key of the node's dictionary, or a key of an edge dictionary.
export interface FieldRefDto {
  entity_field?: "idx" | "date" | "name" | "created_at" | "is_pinned" | "pin_order" | "context";
  /** A key of the node's dictionary (S1): `entities.properties->>path`. */
  property_path?: string;
  /** S4: a key of an EDGE dictionary — per-observer state (unread, pins).
   * The edge is the one of `edge_kind` whose other endpoint carries
   * `observer_anchor`. All three are required together. */
  edge_kind?: string;
  observer_anchor?: string;
  edge_path?: string;
}
export interface OrderKeyDto {
  field: FieldRefDto;
  /** desc → NULLS LAST, asc (default false) → NULLS FIRST. */
  desc?: boolean;
}
/// Windowed list: page of a schema, ordered/filtered by entity column or
/// dictionary key, with the exact total — one DB statement. Each row's
/// dictionary rides on the entity itself.
export interface WindowSpec {
  schema: string;
  filter_field?: FieldRefDto;
  filter_eq?: string;
  /** How `filter_field` is compared to `filter_eq`. Default `"eq"` (=).
   *  `"distinct"` uses SQL `IS DISTINCT FROM` — i.e. "not equal, NULL counts as
   *  not-equal" — so it KEEPS rows whose field is NULL (e.g. untiered contacts)
   *  while excluding the given value. `"exists"` is `IS NOT NULL` — the field
   *  carries ANY value; `filter_eq` is ignored. */
  filter_op?: "eq" | "distinct" | "exists";
  order?: OrderKeyDto[];
  show_archived?: boolean;
  limit: number;
  offset: number;
}
export interface WindowRow {
  entity: RawEntity;
}
export interface WindowPage {
  items: WindowRow[];
  total: number;
}
/// Detail: an entity (dictionary included) + its link edges (one fetch).
export interface EntityDetail {
  entity: RawEntity;
  links: LinkSummary[];
}
/// A parent's neighbors over a typed link.
export interface LinkedSpec {
  parent_id: string;
  link_kind: string;
  direction: "out" | "in";
  child_schema?: string;
  order?: OrderKeyDto[];
  limit: number;
  offset: number;
}
export interface LinkedRow {
  entity: RawEntity;
  link: LinkSummary;
}
export interface LinkedPage {
  items: LinkedRow[];
  total: number;
}


// ── shared list-search paging (added 2026-07-03) ────────────────────────────
// The `searchEntitiesPage` helper (runtime, in ../index.ts) consumes these. The
// host list pane pages via {limit, offset, search} and computes
// hasMore = items.length < total.
export interface SearchEntitiesPageParams {
  query: string;
  schema_id: string;
  limit: number;
  offset: number;
  /** Optional visibility filter (e.g. contacts' group-tier hiding). The helper
   * re-fetches with a growing window until the page (+1) is filled with
   * SURVIVORS or the source is exhausted — filtering never truncates totals. */
  filter?: (entities: RawEntity[]) => Promise<RawEntity[]>;
}
export interface SearchEntitiesPage {
  entities: RawEntity[];
  /** > offset+limit while more matches exist; exact count on the last page. */
  total: number;
}

export interface AddLinkParams {
  from_id: string;
  to_id: string;
  kind: string;
  /** S5: the EDGE dictionary (plan §2) — the per-pair facts that belong to
   * neither endpoint (an invite's display name, an attendee's response). The
   * curated twin of `BatchLinkInput.metadata`. */
  metadata?: Record<string, unknown>;
  /** S3 (plan §5.2): "candidate" records a merge-candidate row, invisible to
   * canonical readers until promoted. Default: canonical. */
  status?: "canonical" | "candidate";
  /** S1 (plan §2): the envelope remote_id that witnessed this edge. On the
   * sync dispatch the host stamps the edge's reserved `metadata.sources`
   * entry and resolves its `observed_at` through THIS key. Meaningless off
   * the sync path. */
  declared_by?: string;
}
export interface LinkSummary {
  id: string;
  from_id: string;
  to_id: string;
  kind: string;
  /** S4: the edge dictionary — per-observer state (unread, pins). */
  metadata?: Record<string, unknown> | null;
  /** S4: canonical | candidate | rejected | decayed. */
  status?: string;
}
/// `list_entities` returns the page + exact user-scoped total,
/// mirroring native list_entities_for_user + count_entities_for_user.
export interface EntityPage {
  items: RawEntity[];
  total: number;
}

/// Mirrors Rust core/merge.rs MergePreview / MergeResult 1:1.
export interface MergeField {
  /** The DICTIONARY key the two hubs agree or disagree on. */
  key: string;
  survivor_value: unknown;
  retired_value: unknown;
  /** What the merge will write — null when it will write NOTHING because the
   *  key needs an answer. */
  auto_resolved: unknown;
  /** Both dictionaries claim this key with DIFFERENT values; the merge
   *  REFUSES to run until an override answers it. */
  conflict: boolean;
}
export interface MergeSource {
  source: string;
  entity_id: string;
  property_count: number;
}
export interface MergePreview {
  survivor: unknown;
  retired: unknown;
  sources: MergeSource[];
  fields: Record<string, MergeField>;
  links_to_repoint: number;
  duplicate_links_to_remove: number;
  reflexive_links_to_remove: number;
}
export interface MergeResult {
  survivor_id: string;
  retired_id: string;
  links_repointed: number;
  links_deduplicated: number;
  links_reflexive_removed: number;
}

/// One entity in an `apply_batch` fragment, identified within the batch by
/// `key` (NOT a graph id). Its `anchor` is its resolve-or-create identity.
export interface BatchEntityInput {
  key: string;
  schema_id: string;
  name?: string;
  idx?: string;
  date?: string;

  /** S3: the node's identity anchor — THE resolver when present. */
  anchor?: string;
  /** S3: the node's dictionary as this sync observed it. The replica
   * contract is fields-as-last-synced — a re-apply REPLACES the dict
   * wholesale (one node, one writer). */
  properties?: Record<string, unknown>;
  /** S5: how sure this module is of the dictionary it just wrote (0-100).
   * The only part of the node's provenance stamp a module supplies — source,
   * account, surface and observed_at are stamped host-side from the sync
   * dispatch context. */
  confidence?: number;
}

/// A pre-existing entity an `apply_batch` link points to — resolved
/// (user-scoped) through the `anchor` chokepoint, never created. A ref that
/// resolves to nothing drops its links.
export interface BatchRefInput {
  key: string;
  anchor?: string;
}

/// A link in an `apply_batch` fragment, wiring two batch `key`s (entity or ref).
export interface BatchLinkInput {
  from_key: string;
  to_key: string;
  kind: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
  /** S1 (plan §2): the key of the batch item whose mapper emitted this edge.
   * On the sync dispatch the HOST stamps the edge's reserved
   * `metadata.sources` array from the envelope context and resolves the
   * stamp's `observed_at` through THIS key — an edge joins two nodes that may
   * arrive in different envelopes, so neither endpoint's timestamp can stand
   * in. A module never writes `sources` itself; the host strips it. */
  declared_by?: string;
}

export interface GraphBatchInput {
  entities: BatchEntityInput[];
  refs?: BatchRefInput[];
  links?: BatchLinkInput[];
}

/// Result of `apply_batch`: batch `key` → resolved/created entity id, plus counts.
export interface GraphBatchResult {
  ids: Record<string, string>;
  created: number;
  updated: number;
  links_added: number;
  dropped_keys: string[];
}

/// The host graph, injected into each plugin module. Mirrors the Rust
/// `GraphService` (flat snake_case names); `actor` / `user_id` are
/// stamped backend-side from `ModuleContext`, never supplied by JS.
///
/// Not parameterised: a node's dictionary is a plain JSON map, and a module
/// types it with its own interface at the call sites that care. The `Canon`
/// type parameter went with the canonical layer it existed to type.
export interface GraphService {
  // entities — rows are always {id, schema_id, name}, no map needed.
  // All reads are user-scoped backend-side.
  create_entity(p: CreateEntityParams): Promise<RawEntity>;
  get_entity(id: string): Promise<RawEntity | null>;
  list_entities(p: ListEntitiesParams): Promise<EntityPage>;
  // Windowed list with the exact total, in one statement. Filter/order over
  // entity columns or dictionary keys.
  list_entities_window(p: WindowSpec): Promise<WindowPage>;
  // One entity (dictionary included) + its link edges, user-scoped (null for
  // a non-owner).
  get_entity_full(id: string, opts?: { links?: boolean }): Promise<EntityDetail | null>;
  // A parent's neighbors over a typed link, with the edge.
  list_linked(p: LinkedSpec): Promise<LinkedPage>;
  // Batch: resolve a set of entity ids in one statement, user-scoped, in
  // input order.
  get_entities(ids: string[]): Promise<RawEntity[]>;
  // user-scoped; omit/empty context = all of the user's entities.
  list_entities_by_context(context?: string): Promise<RawEntity[]>;
  search_entities_by_name(p: SearchEntitiesParams): Promise<RawEntity[]>;
  /** S1/S4: resolve a node by its identity ANCHOR through the chokepoint. */
  find_by_anchor(anchor: string): Promise<string | null>;
  // register a web link (web.link entity + dictionary + bg preview fetch),
  // optionally linked to a parent entity. Returns the web.link entity id.
  web_register(p: { url: string; parent_entity_id?: string; link_kind?: string }): Promise<string>;
  // register a downloadable media file (find-or-create file.object entity +
  // parent link + background download). mime_type is
  // computed plugin-side so the op stays source-agnostic. Returns the
  // file.object entity id.
  file_register(p: {
    external_id: string;
    parent_external_id: string;
    link_kind: string;
    name?: string;
    mime_type: string;
    size_bytes?: number;
    local_path?: string;
    cloud_url?: string;
    source_ref?: Record<string, unknown>;
    source_module: string;
    source_surface: string;
    /** Enqueue the background byte download now. Defaults to `true` host-side;
     *  pass `false` to register the entity without fetching (non-indexed chats). */
    download?: boolean;
  }): Promise<string>;
  // route an Execute SourceCommand to this plugin's source (send/reply/backfill)
  // via the host SyncRouter. Returns the source runtime's JSON result.
  source_command(payload: Record<string, unknown>, account_id?: string): Promise<Record<string, unknown>>;
  // Like source_command, but FIRE-AND-FORGET: the (slow, network-bound) connector
  // fetch + ingest run as a detached host task, so the plugin's single worker
  // channel is not blocked. Returns immediately ({pending:true}); the page lands
  // asynchronously and the host emits `sync.backfill` so the UI can re-fetch.
  request_backfill(payload: Record<string, unknown>, account_id?: string): Promise<{ pending: boolean }>;
  // sync control, keyed by the calling module (not telegram). "status" lists the
  // caller's sync states; "reset" deletes the caller's entities of `reset_schema`
  // (which MUST be in the caller's own namespace) and resets sync state. Overloads
  // make `reset` REQUIRE the schema — `sync_state("reset")` is a compile error, so
  // a plugin can't trip the host's namespace guard at runtime.
  sync_state(action: "status"): Promise<Record<string, unknown>>;
  sync_state(action: "reset", reset_schema: string): Promise<Record<string, unknown>>;
  // reply-composer presence: op "read" | "set_text" | "append_text". read
  // reports presence; set_text/append_text gate+bump the revision and publish.
  composer(
    op: string,
    thread_key?: string,
    text?: string,
    attachment_ids?: string[],
  ): Promise<Record<string, unknown>>;
  update_entity_name(id: string, name: string): Promise<void>;
  update_entity_idx(id: string, idx: string | null): Promise<void>;
  delete_entity(id: string): Promise<void>;

  /// S1 (canonical-graph-structure): write the node's dictionary — the
  /// property-graph write path. The host validates ownership (user +
  /// namespace) and an update un-archives.
  update_properties(
    p: { entity_id: string; properties: Record<string, unknown> },
  ): Promise<void>;
  /// S1: filter a FOLDED family's entities by a top-level dictionary key,
  /// user-scoped natively. Returns the page and the exact total.
  list_entities_by_property_field(
    p: { entity_schema: string; key: string; value: string; limit?: number; offset?: number },
  ): Promise<{ items: RawEntity[]; total: number }>;
  // links — LinkSummary carries the link `id` for targeted deletion.
  add_link(p: AddLinkParams): Promise<void>;
  delete_link(id: string): Promise<void>;
  /** S4: decay an edge the source no longer reports, or restore it on a
   * rejoin (canonical | candidate | rejected | decayed). */
  set_link_status(id: string, status: string): Promise<void>;
  /** Canonical edges by default; `include_all_statuses` also returns
   * candidate / decayed rows (S4's reconciliation restores a rejoin). */
  list_links_for_entity(entity_id: string, include_all_statuses?: boolean): Promise<LinkSummary[]>;
  /** S6 batch: every canonical edge of MANY entities in ONE round-trip. Each
   * row carries `from_id`/`to_id`, so the caller groups. A page whose cards
   * read their neighbours off the edges uses this, never a per-row read. */
  list_links_for_entities(entity_ids: string[]): Promise<LinkSummary[]>;

  // batch — apply a whole graph fragment (entities + links + events) in ONE
  // atomic transaction / one host crossing. The bulk ingest primitive: a page
  // of N messages becomes one call instead of ~3N create/link ops. Entities
  // are keyed by LOCAL `key`s (links/refs wire by key); the `anchor` is the
  // idempotency identity (resolve-or-create).
  apply_batch(batch: GraphBatchInput): Promise<GraphBatchResult>;

  // merge — backed by GraphService::merge_execute, not composed.
  merge_preview(p: { survivor_id: string; retired_id: string }): Promise<MergePreview>;
  merge_execute(p: {
    survivor_id: string;
    retired_id: string;
    overrides?: { key: string; value: unknown }[];
    reason?: string;
  }): Promise<MergeResult>;
}

export interface PluginContext {
  user_id: string;
  extension_kind: string;
  extension_id: string;
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
/// manifest `[permissions]` `call` list; v0 supports native-module targets
/// only (plugin→plugin is rejected host-side).
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
/// description + the JSON-schema `params` for the tool's input.
export interface ToolSpecInput {
  description: string;
  params: Record<string, unknown>;
}

/** The legacy (experimentalDecorators) method-decorator returned by the tool
 * factories — records the method into the module's tool REGISTRY. */
export type MethodRecorder = (target: object, methodName: string, descriptor: PropertyDescriptor) => void;

/// The tool wire shape matches the Rust `ToolDefinition` serde
/// (`inputSchema` MCP field; `requires_approval` write flag) so it
/// deserializes straight into it.
export interface ToolDefinitionWire {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requires_approval: boolean;
}

/// The shape `definePlugin` publishes on the well-known global for the host
/// runtime: a lazy `init` (wires the decorated instance), the post-init RPC
/// handler table, and the harvested agent-tool definitions.
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
  rpcHandlers: Record<string, (params: unknown) => unknown>;
  toolDefinitions: ToolDefinitionWire[];
}
