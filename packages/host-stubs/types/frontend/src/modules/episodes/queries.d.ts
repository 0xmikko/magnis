import type { EpisodeDetailView, EpisodeListItem } from "./types";
export declare const episodeKeys: {
    all: readonly ["episodes"];
    list: (params?: Record<string, unknown>) => readonly ["episodes", "list", Record<string, unknown> | undefined];
    detail: (id: string) => readonly ["episodes", "detail", string];
};
export declare function useEpisodeDetailQuery(episodeId: string | undefined): import("@tanstack/react-query").UseQueryResult<EpisodeDetailView, Error>;
export declare function useEpisodesListQuery(): import("@tanstack/react-query").UseQueryResult<readonly EpisodeListItem[], Error>;
interface CreateEpisodeParams {
    readonly title: string;
    readonly client_id: string;
    readonly mentioned_entity_ids?: readonly string[];
}
export declare function useCreateEpisodeMutation(): import("@tanstack/react-query").UseMutationResult<{
    id: string;
}, Error, CreateEpisodeParams, {
    previous: readonly EpisodeListItem[] | undefined;
}>;
export declare function useArchiveEpisodeMutation(): import("@tanstack/react-query").UseMutationResult<{
    status: string;
}, Error, {
    id: string;
}, unknown>;
export declare function useUnarchiveEpisodeMutation(): import("@tanstack/react-query").UseMutationResult<{
    status: string;
}, Error, {
    id: string;
}, unknown>;
export {};
