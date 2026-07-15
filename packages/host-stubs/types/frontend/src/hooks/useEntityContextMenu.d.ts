/**
 * Generic entity context menu hook.
 *
 * Provides a right-click context menu for any entity list item. Modules can
 * inject their own items via `moduleItems`.
 *
 * "Link to X" submenus (Add/Remove to a group, a project, …) are NOT
 * hardcoded here. Any module can declare a DECLARATIVE `entityLink`
 * contribution on its `ModuleDefinition` (Windows "Send to…" style); this hook
 * discovers all contributors across `APP_MODULES` and renders one submenu per
 * contributor. The host therefore never imports a specific module's queries.
 *
 * Usage:
 *   const ctx = useEntityContextMenu<MyData>({
 *     entityId: (data) => data.id,
 *     moduleItems: (data) => [{ id: "reply", label: "Reply", icon: "send" }],
 *   });
 *
 *   <ModuleListItem onContextMenu={(e) => ctx.open(e, item)}>
 *   {ctx.menu}   // renders ContextMenu when open
 */
import { type ReactNode } from "react";
import type { ContextMenuEntry } from "../components/ui/ContextMenu";
export interface EntityContextMenuConfig<T> {
    /** Extract entity ID from the data attached to the right-clicked item. */
    readonly entityId: (data: T) => string;
    /** Optional module-specific menu items. Placed before the link submenus. */
    readonly moduleItems?: (data: T) => readonly ContextMenuEntry[];
    /** Optional handler for module-specific actions (non-link). */
    readonly onModuleAction?: (data: T, actionId: string) => void;
    /** Suppress specific "Link to X" submenus by their `idPrefix`
     *  (e.g. ["project"] to hide "Link to Project" in a given module). */
    readonly disabledEntityLinks?: readonly string[];
    /** Enable pin/unpin item. If provided, item's is_pinned state is read from this callback. */
    readonly isPinned?: (data: T) => boolean;
    /** Called on delete action. If omitted, delete item is hidden. */
    readonly onDelete?: (data: T) => void;
    /** Called on archive action. If omitted, archive item is hidden. */
    readonly onArchive?: (data: T) => void;
    /** Called on rename action. If omitted, rename item is hidden. */
    readonly onRename?: (data: T) => void;
}
export interface EntityContextMenuResult<T> {
    /** Pass to ModuleListItem's onContextMenu. */
    readonly open: (event: React.MouseEvent, data: T) => void;
    /** Close the menu programmatically. */
    readonly close: () => void;
    /** The currently right-clicked data, or null. */
    readonly data: T | null;
    /** Whether the menu is visible. */
    readonly isOpen: boolean;
    /** Rendered ContextMenu element (or null when closed). Place in JSX. */
    readonly menu: ReactNode;
}
export declare function useEntityContextMenu<T>(config: EntityContextMenuConfig<T>): EntityContextMenuResult<T>;
