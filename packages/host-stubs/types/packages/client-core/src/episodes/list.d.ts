import type { EpisodeListItem } from "@magnis/sdk/core/episode";
export type EpisodeListFilter = "all" | "needs_reply";
export interface EpisodeListQuery {
    readonly search?: string;
    readonly filter?: EpisodeListFilter;
    readonly includeArchived?: boolean;
}
export interface EpisodeListRow extends EpisodeListItem {
    readonly preview: string;
}
export declare function episodePreview(item: EpisodeListItem): string;
/** Pure renderer-neutral Chats projection. Visual grouping remains host-owned. */
export declare function selectEpisodeList(items: readonly EpisodeListItem[], query?: EpisodeListQuery): readonly EpisodeListRow[];
