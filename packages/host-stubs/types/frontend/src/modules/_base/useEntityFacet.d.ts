/**
 * Hook for reading/writing a single facet on an entity.
 * Used for description (common.description) — one facet per entity.
 */
interface UseEntityFacetResult {
    readonly data: Record<string, unknown> | null;
    readonly facetId: string | null;
    readonly isLoading: boolean;
    readonly save: (data: Record<string, unknown>) => void;
}
export declare function useEntityFacet(entityId: string | undefined, schemaId: string): UseEntityFacetResult;
export {};
