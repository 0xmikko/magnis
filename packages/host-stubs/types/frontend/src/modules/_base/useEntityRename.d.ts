import type { AppRuntime } from "../../runtime/contracts/runtime";
import type { ModuleQueryKeys } from "./types";
interface UseEntityRenameParams {
    readonly rpcMethod: string | undefined;
    readonly entityId: string | undefined;
    readonly queryKeys: ModuleQueryKeys;
    readonly runtime: AppRuntime;
    readonly mapParams?: (id: string, name: string) => Record<string, unknown>;
    /** Called during optimistic update for page 2+ items not in RQ cache. */
    readonly onPatchItem?: (id: string, name: string) => void;
}
interface UseEntityRenameResult {
    /** Rename the default entity (header). Uses the fixed entityId. */
    readonly rename: (name: string) => void;
    /** Rename any entity by explicit ID (list items). @tested-by: tst_fe_scn_list_rename_001 */
    readonly renameEntity: (id: string, name: string) => void;
}
export declare function useEntityRename({ rpcMethod, entityId, queryKeys, runtime, mapParams, onPatchItem, }: UseEntityRenameParams): UseEntityRenameResult;
interface UseListRenameStateParams {
    readonly renameEntity: (id: string, name: string) => void;
}
export interface UseListRenameStateResult {
    readonly editingItemId: string | null;
    readonly startRename: (id: string) => void;
    /** Commit rename. No-ops if cancelled, empty, or unchanged. @tested-by: tst_fe_scn_list_rename_001 */
    readonly commitRename: (id: string, originalName: string | null, newName: string) => void;
    /** Cancel rename. Prevents subsequent blur from committing. @tested-by: tst_fe_scn_list_rename_004 */
    readonly cancelRename: () => void;
}
export declare function useListRenameState({ renameEntity, }: UseListRenameStateParams): UseListRenameStateResult;
export {};
