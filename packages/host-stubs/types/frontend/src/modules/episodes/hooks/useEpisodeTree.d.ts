import type { EpisodeSubtreeItem } from "@magnis/sdk/core/episode";
export declare function useEpisodeTree(episodeId: string, options?: {
    readonly openOnly?: boolean;
    readonly directOnly?: boolean;
    readonly enabled?: boolean;
}): {
    readonly items: readonly EpisodeSubtreeItem[];
    readonly loadMore: (() => void) | undefined;
    readonly loading: boolean;
    readonly error: Error | null;
};
