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
/// Filter entities by a facet field value (e.g. messages whose
/// `telegram.message.details.chat_id == <id>`), optionally ordered by a facet
/// field. Returns the page + total.
/// A filter/order field for `list_entities_window` (a FieldRef):
/// an entity column, or a facet field (latest facet of `facet_schema`, JSON
/// `facet_path`). Provide EITHER `entity_field` OR `facet_schema`+`facet_path`.
export interface FieldRefDto {
  entity_field?: "idx" | "date" | "name" | "created_at" | "is_pinned" | "pin_order" | "context";
  facet_schema?: string;
  facet_path?: string;
}
export interface OrderKeyDto {
  field: FieldRefDto;
  /** desc → NULLS LAST, asc (default false) → NULLS FIRST. */
  desc?: boolean;
}
/// Windowed list: page of a schema, each row carrying the latest render
/// facet's `data` inline, ordered/filtered by entity-col or facet-field, with
/// the exact total — one DB statement.
export interface WindowSpec {
  schema: string;
  facet_schema?: string;
  filter_field?: FieldRefDto;
  filter_eq?: string;
  /** How `filter_field` is compared to `filter_eq`. Default `"eq"` (=).
   *  `"distinct"` uses SQL `IS DISTINCT FROM` — i.e. "not equal, NULL counts as
   *  not-equal" — so it KEEPS rows whose field is NULL (e.g. untiered contacts)
   *  while excluding the given value. */
  filter_op?: "eq" | "distinct";
  order?: OrderKeyDto[];
  show_archived?: boolean;
  limit: number;
  offset: number;
}
export interface WindowRow {
  entity: RawEntity;
  data: unknown;
}
export interface WindowPage {
  items: WindowRow[];
  total: number;
}
/// Detail: an entity + its latest facets + its link edges (one fetch).
export interface EntityDetail {
  entity: RawEntity;
  facets: FacetRecord[];
  links: LinkSummary[];
}
/// A parent's neighbors over a typed link.
export interface LinkedSpec {
  parent_id: string;
  link_kind: string;
  direction: "out" | "in";
  child_schema?: string;
  facet_schema?: string;
  order?: OrderKeyDto[];
  limit: number;
  offset: number;
}
export interface LinkedRow {
  entity: RawEntity;
  data: unknown;
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

export interface FacetFieldListParams {
  entity_schema: string;
  facet_schema: string;
  field_path: string;
  field_value: string;
  order_field_path?: string;
  limit?: number;
  offset?: number;
}
export interface AddLinkParams {
  from_id: string;
  to_id: string;
  kind: string;
}
export interface LinkSummary {
  id: string;
  from_id: string;
  to_id: string;
  kind: string;
}
/// A facet as returned by list_facets_for_entity — all schemas, data
/// kept opaque (the plugin narrows per schema_id at its own boundary).
export interface FacetRecord {
  /** Only set by list_facets_for_entities (batch) — lets callers group facets
   *  back to their entity without an N+1. */
  entity_id?: string;
  id: string;
  schema_id: string;
  source: string;
  observed_at: string;
  data: unknown;
}
/// One canonical property as returned by list_canonical_for_entities (batch):
/// the entity it belongs to, the canonical key, and the merged value. Callers
/// group by entity_id to rebuild the per-entity map get_canonical returns.
export interface CanonicalRecord {
  entity_id: string;
  key: string;
  value: unknown;
}
/// `list_entities` returns the page + exact user-scoped total,
/// mirroring native list_entities_for_user + count_entities_for_user.
export interface EntityPage {
  items: RawEntity[];
  total: number;
}

/// Mirrors Rust core/merge.rs MergePreview / MergeResult 1:1.
export interface MergeField {
  canonical_key: string;
  strategy: string;
  candidates: unknown[];
  survivor_value: unknown;
  retired_value: unknown;
  auto_resolved: unknown;
}
export interface MergeSource {
  source: string;
  entity_id: string;
  facet_count: number;
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
  facets_moved: number;
  links_repointed: number;
  links_deduplicated: number;
  links_reflexive_removed: number;
}

/// One facet in an `apply_batch` entity. `external_id` + `confidence` mirror
/// `attach_facet`; the host stamps the source identity from the calling plugin.
export interface BatchFacetInput {
  schema_id: string;
  data: Record<string, unknown>;
  external_id?: string;
  confidence?: number;
}

/// One entity in an `apply_batch` fragment, identified within the batch by `key`
/// (NOT a graph id). Its first facet that carries an `external_id` is the entity's
/// resolve-or-create identity.
export interface BatchEntityInput {
  key: string;
  schema_id: string;
  name?: string;
  idx?: string;
  date?: string;
  facets: BatchFacetInput[];
}

/// A pre-existing entity an `apply_batch` link points to — resolved (user-scoped)
/// by `external_id`, never created. An unresolved ref drops its links.
export interface BatchRefInput {
  key: string;
  external_id: string;
}

/// A link in an `apply_batch` fragment, wiring two batch `key`s (entity or ref).
export interface BatchLinkInput {
  from_key: string;
  to_key: string;
  kind: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
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
/// Parameterised by two plugin-declared schema→type maps:
///   - `Facets`: facet schema_id → payload type
///   - `Canon`:  canonical key   → value type
/// The facet/canonical types are DERIVED from the schema_id/key literal
/// at the call site (not free type params the caller can lie about).
///
/// The surface is the full target; ops are wired per migration stage.
export interface GraphService<
  Facets extends object = Record<string, unknown>,
  Canon extends object = Record<string, unknown>,
> {
  // entities — rows are always {id, schema_id, name}, no map needed.
  // All reads are user-scoped backend-side.
  create_entity(p: CreateEntityParams): Promise<RawEntity>;
  get_entity(id: string): Promise<RawEntity | null>;
  list_entities(p: ListEntitiesParams): Promise<EntityPage>;
  // filter by a facet field value (+ optional facet-field order); page + total.
  list_entities_by_facet_field(p: FacetFieldListParams): Promise<EntityPage>;
  // Windowed list with the latest render facet inline + exact total, in one
  // statement. Filter/order over entity columns or facet fields.
  list_entities_window(p: WindowSpec): Promise<WindowPage>;
  // One entity with its latest facets (optional schema subset) + link edges,
  // user-scoped (null for a non-owner).
  get_entity_full(
    id: string,
    opts?: { facets?: string[]; links?: boolean },
  ): Promise<EntityDetail | null>;
  // A parent's neighbors over a typed link, render facet inline + the edge.
  list_linked(p: LinkedSpec): Promise<LinkedPage>;
  // Batch: resolve a set of entity ids in one statement, user-scoped, in
  // input order.
  get_entities(ids: string[]): Promise<RawEntity[]>;
  // user-scoped; omit/empty context = all of the user's entities.
  list_entities_by_context(context?: string): Promise<RawEntity[]>;
  search_entities_by_name(p: SearchEntitiesParams): Promise<RawEntity[]>;
  // user-scoped find of the entity owning a facet with this source external_id
  // (ingest find-or-create). Returns the entity id or null.
  find_by_external_id(external_id: string): Promise<string | null>;
  // register a web link (web.link entity + metadata facet + bg preview fetch),
  // optionally linked to a parent entity. Returns the web.link entity id.
  web_register(p: { url: string; parent_entity_id?: string; link_kind?: string }): Promise<string>;
  // register a downloadable media file (find-or-create file.object entity +
  // file.details facet + parent link + background download). mime_type is
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

  // facets — payload type DERIVED from the schema_id literal.
  // external_id (+ optional confidence 1-100) stamps provenance AND makes the
  // attach idempotent (find-and-update the facet keyed by entity + external_id).
  attach_facet<K extends keyof Facets & string>(
    p: { entity_id: string; schema_id: K; data: Facets[K]; external_id?: string; confidence?: number },
  ): Promise<{ id: string }>;
  update_facet<K extends keyof Facets & string>(
    p: { facet_id: string; schema_id: K; data: Facets[K] },
  ): Promise<void>;
  // all facets across schemas (data opaque) — used for cross-schema
  // reads like contacts' channel detection.
  list_facets_for_entity(entity_id: string): Promise<FacetRecord[]>;
  /** Batch: every facet for many entities in ONE DB round-trip (vs N). Each
   *  record carries entity_id so the caller can group. */
  list_facets_for_entities(entity_ids: string[]): Promise<FacetRecord[]>;
  delete_facet(id: string): Promise<void>;

  // canonical — keys + values typed by the plugin's Canon map.
  get_canonical(entity_id: string, schemas?: string[]): Promise<Partial<Canon>>;
  list_canonical_for_entity(entity_id: string): Promise<Partial<Canon>>;
  /** Batch: every canonical property for many entities in ONE DB round-trip (vs
   *  N get_canonical). Each record carries entity_id so the caller can group it
   *  back into a per-entity `Partial<Canon>` map. */
  list_canonical_for_entities(entity_ids: string[]): Promise<CanonicalRecord[]>;
  /// Recompute canonical properties from the entity's facets + mappings.
  /// Call after attach_facet so get_canonical reflects the new data.
  resolve_canonical(entity_id: string): Promise<void>;
  apply_canonical_override<K extends keyof Canon & string>(
    p: { entity_id: string; key: K; value: Canon[K] },
  ): Promise<void>;

  // links — LinkSummary carries the link `id` for targeted deletion.
  add_link(p: AddLinkParams): Promise<void>;
  delete_link(id: string): Promise<void>;
  list_links_for_entity(entity_id: string): Promise<LinkSummary[]>;

  // batch — apply a whole graph fragment (entities + facets + links + events) in
  // ONE atomic transaction / one host crossing. The bulk ingest primitive: a page
  // of N messages becomes one call instead of ~3N create/attach/link ops. Entities
  // are keyed by LOCAL `key`s (links/refs wire by key); a facet's `external_id` is
  // the idempotency identity (resolve-or-create the owning entity, upsert the facet).
  apply_batch(batch: GraphBatchInput): Promise<GraphBatchResult>;

  // merge — backed by GraphService::merge_execute, not composed.
  merge_preview(p: { survivor_id: string; retired_id: string }): Promise<MergePreview>;
  merge_execute(p: {
    survivor_id: string;
    retired_id: string;
    overrides?: { canonical_key: string; value: unknown }[];
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

export interface PluginDeps<
  Facets extends object = Record<string, unknown>,
  Canon extends object = Record<string, unknown>,
> {
  graph: GraphService<Facets, Canon>;
  ctx: PluginContext;
  util: PluginUtil;
  rpc: RpcExecutor;
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
  init: (
    graph: unknown,
    ctx: PluginContext,
    util: PluginUtil,
    rpc: RpcExecutor,
  ) => Promise<void>;
  rpcHandlers: Record<string, (params: unknown) => unknown>;
  toolDefinitions: ToolDefinitionWire[];
}
