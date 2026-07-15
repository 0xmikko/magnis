/**
 * useEntityLinkedEpisodes — lists the most recent episodes (max 50) that
 * touched a given entity, via `episodes.list_for_entity`.
 *
 * Plan item #5 (docs/plans/context-panel-from-graph.md).
 */
export interface EpisodeLinkSummary {
    readonly episode_id: string;
    readonly title: string;
    readonly status: string;
    readonly link_kinds: readonly string[];
    readonly updated_at: string;
    readonly is_empty: boolean;
}
export declare function useEntityLinkedEpisodes(entityId: string | undefined): import("@tanstack/react-query").UseQueryResult<readonly EpisodeLinkSummary[], Error>;
