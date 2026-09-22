import type { PaginatedResponse } from "../../hooks/types";
import type { ListItem, ModuleQueryKeys } from "./types";
export declare function useModuleCreate(queryKeys: ModuleQueryKeys, rpcMethod: string): import("@tanstack/react-query").UseMutationResult<{
    id: string;
}, Error, Record<string, unknown> & {
    client_id: string;
}, {
    previous: PaginatedResponse<ListItem> | undefined;
}>;
export declare function useModuleUpdate(queryKeys: ModuleQueryKeys, rpcMethod: string): import("@tanstack/react-query").UseMutationResult<void, Error, Record<string, unknown>, unknown>;
export declare function useModuleDelete(queryKeys: ModuleQueryKeys, rpcMethod: string): import("@tanstack/react-query").UseMutationResult<void, Error, {
    id: string;
}, {
    previous: PaginatedResponse<ListItem> | undefined;
}>;
export declare function useModulePin(queryKeys: ModuleQueryKeys): import("@tanstack/react-query").UseMutationResult<void, Error, {
    entity_id: string;
    pin_order?: number;
}, unknown>;
export declare function useModuleUnpin(queryKeys: ModuleQueryKeys): import("@tanstack/react-query").UseMutationResult<void, Error, {
    entity_id: string;
}, unknown>;
export declare function useModuleArchive(queryKeys: ModuleQueryKeys): import("@tanstack/react-query").UseMutationResult<void, Error, {
    entity_id: string;
}, unknown>;
export declare function useModuleUnarchive(queryKeys: ModuleQueryKeys): import("@tanstack/react-query").UseMutationResult<void, Error, {
    entity_id: string;
}, unknown>;
