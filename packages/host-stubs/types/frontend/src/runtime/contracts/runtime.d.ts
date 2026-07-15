import type { QueryClient } from "@tanstack/react-query";
import type { AppTransport } from "./transport";
import type { ModuleRegistry, ModuleStoreRegistry } from "./module";
import type { AgentRuntime, ComposerRuntimeSurface } from "./agent";
export interface AppRuntime {
    readonly queryClient: QueryClient;
    readonly transport: AppTransport;
    readonly modules: ModuleRegistry;
    readonly stores: ModuleStoreRegistry;
    readonly agent: AgentRuntime;
    readonly composer: ComposerRuntimeSurface;
}
