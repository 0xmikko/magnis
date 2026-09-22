/**
 * useEntityLinkedEpisodes — lists the most recent episodes (max 50) that
 * touched a given entity, via `episodes.list_for_entity`.
 *
 * Plan item #5 (docs/plans/context-panel-from-graph.md).
 */
export type { EpisodeLinkSummary } from "@magnis/sdk";
interface EpisodeIdentity {
    readonly episodeId: string;
}
export declare function selectEntityLinkedEpisodeRows<T extends EpisodeIdentity>(rows: readonly T[], currentEpisodeId: string, currentEntityId: string | undefined): T[];
export declare function useEntityLinkedEpisodes(entityId: string | undefined): import("@tanstack/react-query").UseQueryResult<{
    episodeId: string;
    title: string;
    status: string;
    isArchived: boolean;
    linkKinds: string[];
    updatedAt: string;
    isEmpty: boolean;
}[], Error>;
