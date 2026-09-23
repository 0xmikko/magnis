/**
 * Context Panel merge helpers.
 *
 * Implements plan item #5: merge the current episode's linked_entities with
 * the entity-graph's episode list for the entity on screen. Dedupe by
 * episodeId, union linkKinds, and rank-sort the kinds.
 *
 * See docs/plans/context-panel-from-graph.md plan item #5 & #11.
 */
/** Stable rank — lower index = higher priority. Unknown kinds pushed to tail. */
export declare const LINK_KIND_RANK: readonly string[];
export declare function rankLinkKinds(kinds: readonly string[]): string[];
export interface EpisodeLinkRow {
    readonly episodeId: string;
    readonly title?: string;
    readonly status?: string;
    readonly isArchived?: boolean;
    readonly linkKinds: readonly string[];
    readonly updatedAt?: string;
    readonly isEmpty?: boolean;
}
export interface MergeInput {
    readonly fromEntityGraph: readonly EpisodeLinkRow[];
    readonly fromCurrentEpisode: readonly EpisodeLinkRow[];
}
/**
 * Merge entity-graph rows and current-episode rows. Dedupe by episodeId,
 * union linkKinds with stable rank order.
 */
export declare function mergeContextPanelEpisodes(input: MergeInput): EpisodeLinkRow[];
