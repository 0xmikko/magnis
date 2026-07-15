export interface TriggerListItem {
    readonly id: string;
    readonly name: string;
    readonly status: "active" | "paused" | "expired" | "disabled";
    readonly firing_count: number;
    readonly last_fired_at: string | null;
}
export interface TriggerDetailView {
    readonly id: string;
    readonly name: string;
    readonly gate_prompt: string;
    readonly action_prompt: string;
    readonly status: "active" | "paused" | "expired" | "disabled";
    readonly event_kinds: readonly string[];
    readonly schema_filter: string | null;
    readonly expires_at: string | null;
    readonly cooldown_seconds: number;
    readonly max_firings: number | null;
    readonly firing_count: number;
    readonly last_fired_at: string | null;
    readonly watched_entities: readonly WatchedEntity[];
}
export interface WatchedEntity {
    readonly id: string;
    readonly name: string | null;
}
export interface TriggerExecution {
    readonly fired_at: string;
    readonly event_entity_id: string;
    readonly gate_result: string | null;
    readonly episode_id: string | null;
    readonly outcome: string;
}
export interface ResolvedWatch {
    readonly id: string;
    readonly schema_id: string;
    readonly data: Record<string, unknown>;
    readonly error?: boolean;
}
export interface CreateTriggerParams {
    readonly name: string;
    readonly gate_prompt: string;
    readonly action_prompt: string;
    readonly event_kinds?: readonly string[];
    readonly watch_entity_ids?: readonly string[];
    readonly cooldown_seconds?: number;
    readonly max_firings?: number;
    readonly expires_at?: string;
}
