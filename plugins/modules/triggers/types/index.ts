// Triggers plugin — shared wire types (backend module + frontend UI).
// Byte-compatible TS port of the native `backend/src/modules/triggers/types.rs`
// structs the engine reads/writes. The processing engine stays native; this
// plugin only owns the DEFINITION CRUD, so these mirror the graph contract:
// `triggers.trigger` entity + `triggers.trigger.config` facet + `watches` /
// `belongs_to` links.

/// Facet schema_id → payload, used to parameterise GraphService<TriggerFacets, …>.
/// `config` is written by the plugin (create/update) AND by the native engine
/// (firing_count / last_fired_at); `execution` is written by the engine and
/// read by the plugin's `fire_history`.
export interface TriggerFacets {
  "triggers.trigger.config": TriggerConfigData;
  "triggers.trigger.execution": TriggerExecutionData;
}

/// Mirrors native `TriggerConfig` (serde with skip-if-none optionals).
export interface TriggerConfigData {
  name: string;
  gate_prompt: string;
  action_prompt: string;
  status: string;
  event_kinds: string[];
  schema_filter?: string;
  expires_at?: string;
  debounce_seconds: number;
  max_wait_seconds?: number;
  max_firings?: number;
  firing_count: number;
  last_fired_at?: string;
}

/// Mirrors native `TriggerExecution` (the `.execution` facet the engine writes).
export interface TriggerExecutionData {
  fired_at: string;
  event_entity_id: string;
  gate_result?: string;
  episode_id?: string;
  outcome: string;
}

/// Mirrors native `TriggerListItem`.
export interface TriggerListItem {
  schema_id: string;
  id: string;
  name: string;
  status: string;
  gate_prompt: string;
  action_prompt: string;
  firing_count: number;
  last_fired_at?: string | null;
  watched_entity_names: string[];
}

/// Mirrors native `WatchedEntity`.
export interface WatchedEntity {
  id: string;
  name: string | null;
}

/// Mirrors native `TriggerDetailView`.
export interface TriggerDetailView {
  id: string;
  name: string;
  gate_prompt: string;
  action_prompt: string;
  status: string;
  event_kinds: string[];
  schema_filter?: string | null;
  expires_at?: string | null;
  debounce_seconds: number;
  max_wait_seconds?: number | null;
  max_firings?: number | null;
  firing_count: number;
  last_fired_at?: string | null;
  watched_entities: WatchedEntity[];
  parent_episode_id?: string | null;
  parent_episode_name?: string | null;
}

/// The create response shape (native `service.create` JSON).
export interface TriggerCreated {
  id: string;
  name: string;
  status: string;
  gate_prompt: string;
  action_prompt: string;
  firing_count: number;
  last_fired_at: string | null;
  schema_id: string;
  created_at: string;
  episode_id: string | null;
}

// ── tool params ──────────────────────────────────────────────────

export interface CreateTriggerParams {
  name: string;
  gate_prompt?: string;
  action_prompt: string;
  event_kinds?: string[];
  watch_entity_ids?: string[];
  episode_id?: string;
  schema_filter?: string;
  expires_at?: string;
  debounce_seconds?: number;
  max_wait_seconds?: number;
  max_firings?: number;
}
export interface GetTriggerParams {
  id: string;
}
export interface ListTriggersParams {
  status?: string;
}
export interface UpdateTriggerParams {
  id: string;
  name?: string;
  gate_prompt?: string;
  action_prompt?: string;
  status?: string;
  event_kinds?: string[];
  schema_filter?: string;
  expires_at?: string;
  debounce_seconds?: number;
  max_wait_seconds?: number;
  max_firings?: number;
}
export interface DeleteTriggerParams {
  id: string;
}
export interface LinkTriggerParams {
  trigger_id: string;
  entity_id: string;
}
export interface ListForEntityParams {
  entity_id: string;
}
export interface FireHistoryParams {
  trigger_id: string;
  limit?: number;
}

/// The native `validate_watch` rpc returns either `null` (all watchable) or a
/// `clarification_needed` payload — passed back to the agent verbatim.
export type ClarificationResult = Record<string, unknown> | null;

/// Native `triggers.resolve_watchable` rpc response.
export interface ResolveWatchableResult {
  watchable: Array<{
    id: string;
    name: string | null;
    schema_id: string;
    link_kind: string;
  }>;
}
