/**
 * TanStack Query hooks for RPC calls.
 *
 * Provides useRpcQuery and useRpcMutation as thin wrappers
 * that use AppRuntime transport for all RPC calls.
 */
import { type UseQueryOptions, type UseMutationOptions } from "@tanstack/react-query";
export declare function useRpcQuery<TData>(queryKey: readonly unknown[], method: string, params?: Record<string, unknown>, options?: Omit<UseQueryOptions<TData>, "queryKey" | "queryFn">): import("@tanstack/react-query").UseQueryResult<import("@tanstack/query-core").NoInfer<TData>, Error>;
export declare function useRpcMutation<TData = unknown, TVariables = Record<string, unknown>>(method: string, options?: Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn">): import("@tanstack/react-query").UseMutationResult<TData, Error, TVariables, unknown>;
