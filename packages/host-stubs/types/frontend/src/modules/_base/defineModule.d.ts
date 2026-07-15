import type { ModuleDefinition } from "../../runtime/contracts/module";
import type { ModuleConfig } from "./types";
export interface BaseModuleStoreState {
    selectedId: string | undefined;
    searchQuery: string;
    [key: string]: unknown;
}
/**
 * Define a module from config. Returns a ModuleDefinition with all
 * standard behavior built in — list, detail, router, context menu,
 * prefetch, invalidation, agent contributions.
 *
 * Override only what's different.
 */
export declare function defineModule(config: ModuleConfig): ModuleDefinition;
