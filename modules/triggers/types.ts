// Triggers plugin — shared wire types (backend module + frontend UI).
// Byte-compatible TS port of the native `backend/src/modules/triggers/types.rs`
// structs the engine reads/writes. The processing engine stays native; this
// plugin only owns the DEFINITION CRUD, so these mirror the graph contract:
// `triggers.trigger` entity + `triggers.trigger.config` record + `watches` /
// `belongs_to` links.

/// `config` is written by the plugin (create/update) AND by the native engine
/// (firing_count / last_fired_at); executions are written by the engine and
/// read through the native `triggers.fire_history` seam.

/// Mirrors native `ScheduleSpec` (docs/plans/cron-triggers.md), as the trigger's
/// dictionary stores it. The plugin never constructs one itself — it persists
/// what the native `triggers.validate_schedule` seam returns (engine-stamped
/// `activatedAt`, stored as `activated_at`; materialized timezone).
export interface TriggerScheduleSpec {
  cron: string;
  timezone: string;
  activated_at: string;
}

/// What the caller may pass to create/update. `activated_at` is deliberately
/// absent — it is stamped by the engine's clock, never by the caller.
export interface ScheduleParam {
  cron: string;
  timezone?: string;
}

/// Mirrors native `TriggerConfig` (serde with skip-if-none optionals).
/** The four states the module's own `list` tool documents and filters on. It
 * was `string`, so `update` wrote whatever a caller sent and the graph kept
 * it; the declaration in `entities.ts` now refuses the rest. */
export type TriggerStatus = "active" | "paused" | "disabled" | "expired";

export interface TriggerConfigData {
  name: string;
  gate_prompt: string;
  action_prompt: string;
  status: TriggerStatus;
  event_kinds: string[];
  schema_filter?: string;
  expires_at?: string;
  debounce_seconds: number;
  max_wait_seconds?: number;
  max_firings?: number;
  firing_count: number;
  last_fired_at?: string;
  schedule?: TriggerScheduleSpec;
}

/// Mirrors native `TriggerListItem`.
export interface TriggerListItem {
  schemaId: string;
  id: string;
  name: string;
  status: string;
  gatePrompt: string;
  actionPrompt: string;
  firingCount: number;
  lastFiredAt?: string | null;
  watchedEntityNames: string[];
  schedule?: TriggerScheduleSpec | null;
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
  gatePrompt: string;
  actionPrompt: string;
  status: string;
  eventKinds: string[];
  schemaFilter?: string | null;
  expiresAt?: string | null;
  debounceSeconds: number;
  maxWaitSeconds?: number | null;
  maxFirings?: number | null;
  firingCount: number;
  lastFiredAt?: string | null;
  watchedEntities: WatchedEntity[];
  parentEpisodeId?: string | null;
  parentEpisodeName?: string | null;
  schedule?: TriggerScheduleSpec | null;
}

/// The create response shape (native `service.create` JSON).
export interface TriggerCreated {
  id: string;
  name: string;
  status: string;
  gatePrompt: string;
  actionPrompt: string;
  firingCount: number;
  lastFiredAt: string | null;
  schemaId: string;
  createdAt: string;
  episodeId: string | null;
  /// The persisted schedule, echoed so the tool-call card can render it.
  schedule?: TriggerScheduleSpec | null;
}

// ── tool params ──────────────────────────────────────────────────

export interface CreateTriggerParams {
  name?: string;
  from_addresses?: string[];
  from_address?: string;
  chat_id?: number | string;
  /** Required: a trigger with no condition fires on everything it watches. */
  gate_prompt: string;
  action_prompt: string;
  event_kinds?: string[];
  watch_entity_ids?: string[];
  episode_id?: string;
  schema_filter?: string;
  expires_at?: string;
  debounce_seconds?: number;
  max_wait_seconds?: number;
  max_firings?: number;
  /** Optional cron schedule; `null` is tolerated at the untyped agent
   *  boundary and means the same as omitting it. */
  schedule?: ScheduleParam | null;
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
  status?: TriggerStatus;
  event_kinds?: string[];
  schema_filter?: string;
  expires_at?: string;
  debounce_seconds?: number;
  max_wait_seconds?: number;
  max_firings?: number;
  /** Set (re-normalized through the seam) or clear (`null`) the schedule. */
  schedule?: ScheduleParam | null;
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
