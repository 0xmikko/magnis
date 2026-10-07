/**
 * SearchResults — dropdown overlay showing search results as entity cards.
 */
import type { JSX } from "react";
import type { SearchResult } from "@magnis/sdk";
interface SearchResultsProps {
    readonly results: readonly SearchResult[];
    readonly isSearching: boolean;
    readonly query: string;
    readonly onSelect: (id: string, schemaId: string) => void;
    readonly onAgentSearch: (query: string) => void;
}
export declare function SearchResults({ results, isSearching, query, onSelect, onAgentSearch, }: SearchResultsProps): JSX.Element | null;
export {};
