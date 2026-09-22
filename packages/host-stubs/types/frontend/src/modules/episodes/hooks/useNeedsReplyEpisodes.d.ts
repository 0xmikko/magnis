import { type NeedsReplyEpisode } from "../helpers";
export declare function useNeedsReplyEpisodes(enabled: boolean): {
    readonly items: readonly NeedsReplyEpisode[];
    readonly error: Error | null;
};
