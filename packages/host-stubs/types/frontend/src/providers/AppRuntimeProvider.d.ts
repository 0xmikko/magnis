/**
 * AppRuntimeProvider — infrastructure-only runtime container.
 *
 * Holds: QueryClient, AppTransport, ModuleRegistry, ModuleStoreRegistry, AgentRuntime.
 * Does NOT hold module-specific business state.
 */
import { type ReactNode } from "react";
import type { JSX } from "react";
import type { AppRuntime } from "../runtime/contracts";
import type { ModuleDefinition } from "../runtime/contracts";
export declare function useAppRuntime(): AppRuntime;
export declare function AppRuntimeProvider({ children, moduleDefinitions }: {
    readonly children: ReactNode;
    readonly moduleDefinitions?: readonly ModuleDefinition[];
}): JSX.Element;
