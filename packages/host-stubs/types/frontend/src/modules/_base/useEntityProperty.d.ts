/**
 * Hook for reading/writing ONE key of an entity's dictionary (S5).
 *
 * The property-graph twin of `useEntityFacet`: a node's data lives in
 * `entities.properties`, with one writer per node, so a curated edit is a
 * top-level MERGE of the single key it touches — never a wholesale replace,
 * which belongs to the sync path that owns the whole dictionary.
 */
interface UseEntityPropertyResult {
    readonly value: string;
    readonly isLoading: boolean;
    readonly save: (value: string) => void;
}
export declare function useEntityProperty(entityId: string | undefined, key: string): UseEntityPropertyResult;
/** The whole dictionary of an entity, read-only (S5). One crossing, cached
 *  with `useEntityProperty` under the same key so an edit refreshes both. */
export declare function useEntityProperties(entityId: string | undefined): {
    readonly properties: Record<string, unknown>;
    readonly isLoading: boolean;
};
export {};
