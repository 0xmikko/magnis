export interface UseModuleRouterResult {
    readonly selectedId: string | undefined;
    readonly setSelectedId: (id: string | undefined) => void;
}
/**
 * URL sync hook for BaseModule.
 * Reads entityId from router when this module is active.
 * Writes selection back to URL as #/{moduleId}/{primaryEntityType}/{entityId}.
 */
export declare function useModuleRouter(moduleId: string, primaryEntityType: string): UseModuleRouterResult;
