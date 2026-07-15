export interface UseModuleListConfig<TRaw, T> {
    readonly rpcMethod: string;
    readonly queryKeyBase: readonly unknown[];
    readonly mapItem: (raw: TRaw) => T;
    readonly getId: (item: T) => string;
    readonly pageSize?: number;
    /** Extra params merged into every list RPC call */
    readonly extraParams?: Readonly<Record<string, unknown>>;
}
export interface UseModuleListResult<T> {
    readonly items: readonly T[];
    readonly total: number;
    readonly isLoading: boolean;
    readonly searchQuery: string;
    readonly setSearchQuery: (q: string) => void;
    readonly selectedId: string | undefined;
    readonly setSelectedId: (id: string | undefined) => void;
    readonly hasMore: boolean;
    readonly loadMore: () => void;
    readonly navigateTo: (id: string) => void;
    /** Patch a single item in the extra (page 2+) items list by ID. */
    readonly patchItem: (id: string, patch: Partial<T>) => void;
}
export declare function useModuleList<TRaw, T>(config: UseModuleListConfig<TRaw, T>): UseModuleListResult<T>;
