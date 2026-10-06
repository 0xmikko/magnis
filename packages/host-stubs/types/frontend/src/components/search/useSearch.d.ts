/**
 * useSearch — calls search.fast RPC for combined search with optional mentions.
 */
import type { SearchResult } from "@magnis/sdk";
interface UseSearchResult {
    readonly results: readonly SearchResult[];
    readonly isSearching: boolean;
}
export declare function useSearch(query: string, mentionIds: readonly string[], active: boolean): UseSearchResult;
export {};
