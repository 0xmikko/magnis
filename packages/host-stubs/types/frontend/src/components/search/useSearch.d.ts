/**
 * useSearch — calls search.fast RPC for combined search with optional mentions.
 */
export interface SearchResultItem {
    readonly id: string;
    readonly name: string | null;
    readonly schema_id: string;
    readonly score: number;
    readonly link_kind?: string;
    readonly data: Readonly<Record<string, unknown>> | null;
}
interface UseSearchResult {
    readonly results: readonly SearchResultItem[];
    readonly isSearching: boolean;
}
export declare function useSearch(query: string, mentionIds: readonly string[], active: boolean): UseSearchResult;
export {};
