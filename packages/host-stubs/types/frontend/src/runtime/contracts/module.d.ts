import type { ComponentType, ReactNode } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { AppRuntime } from "./runtime";
import type { ModuleAgentContribution } from "./agent";
import type { IconName } from "../../components/ui/Icon";
import type { AvatarColor } from "../../modules/shared/types";
export interface ModuleRouteDefinition {
    readonly path: string;
    readonly title?: string;
}
/**
 * Declarative "Link to X" context-menu contribution — Windows "Send to…"
 * style. A module that owns a link-target entity (a group, a project)
 * declares ONE of these; the generic entity context menu
 * (`useEntityContextMenu`) discovers all contributors across `APP_MODULES`
 * and renders a submenu per contributor for any right-clicked entity. The
 * host stays decoupled — it never imports a specific module's queries.
 *
 * Contract for the RPC methods:
 * - `listMethod`    → all targets. Returns `T[]` or `{ items: T[] }`.
 * - `forEntityMethod(entity_id)` → targets the entity is already linked to
 *   (bare `T[]`).
 * - `addMethod` / `removeMethod` are called with
 *   `{ [idParam]: targetId, entity_id }`.
 * Each target `T` must expose `{ id, name }` (+ optional `color` when `hasColor`).
 */
export interface EntityLinkContribution {
    /** Action-id namespace, e.g. "group" / "project". Must be unique per contributor. */
    readonly idPrefix: string;
    /** Submenu label, e.g. "Link to Group". */
    readonly label: string;
    /** Submenu icon. */
    readonly icon: IconName;
    /** RPC returning all link targets (`T[]` or `{ items: T[] }`). */
    readonly listMethod: string;
    /** RPC returning the targets the entity is already linked to (bare `T[]`). */
    readonly forEntityMethod: string;
    /** Param name carrying the target id in add/remove calls, e.g. "group_id". */
    readonly idParam: string;
    /** RPC linking the entity to a target. */
    readonly addMethod: string;
    /** RPC unlinking the entity from a target. */
    readonly removeMethod: string;
    /** Root react-query key invalidated after add/remove, e.g. "groups". */
    readonly invalidateKey: string;
    /** When true, each target carries a `color` rendered as a color dot. */
    readonly hasColor?: boolean;
}
export interface ModuleDefinition<TState = unknown, TStore extends StoreApi<TState> = StoreApi<TState>> {
    readonly id: string;
    readonly title: string;
    /** Sidebar icon. Modules without an icon are headless (no sidebar entry). */
    readonly icon?: ReactNode;
    /** Icon name for programmatic use (context panels, badges) */
    readonly iconName?: IconName;
    /** Theme color for programmatic use */
    readonly themeColor?: AvatarColor;
    readonly color?: string;
    readonly routes?: readonly ModuleRouteDefinition[];
    /** Main component. Headless modules (agent-only contributions) may omit this. */
    readonly Component?: ComponentType;
    createStore?(runtime: AppRuntime): TStore;
    setup?(runtime: AppRuntime, store: TStore): void | (() => void) | Promise<void | (() => void)>;
    readonly agent?: ModuleAgentContribution;
    /** Declarative "Link to X" context-menu submenu this module contributes. */
    readonly entityLink?: EntityLinkContribution;
}
export interface ModuleRegistry {
    list(): readonly ModuleDefinition[];
    get(moduleId: string): ModuleDefinition | undefined;
    register(definition: ModuleDefinition): void;
}
export interface ModuleStoreRegistry {
    register<TStore extends StoreApi<unknown>>(moduleId: string, store: TStore): void;
    get<TStore extends StoreApi<unknown>>(moduleId: string): TStore | undefined;
    has(moduleId: string): boolean;
}
export type ModuleStoreFactory<TState> = (runtime: AppRuntime) => StoreApi<TState>;
export declare function registerModuleStore<TState>(runtime: AppRuntime, moduleId: string, create: ModuleStoreFactory<TState>): StoreApi<TState>;
