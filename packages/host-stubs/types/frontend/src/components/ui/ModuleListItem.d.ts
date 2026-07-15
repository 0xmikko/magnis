import type { ReactNode, JSX } from "react";
import type React from "react";
export interface ModuleListItemProps {
    readonly selected?: boolean;
    readonly children: ReactNode;
    /** Module-specific context menu handler. If omitted, right-click is silently suppressed. */
    readonly onContextMenu?: (e: React.MouseEvent) => void;
}
/**
 * Wrapper for list items in module list panes.
 * Handles selection state and hover styling.
 * Click handling is managed by the parent module pane renderer.
 * Plugins compose this with their own content.
 *
 * Context menu pattern:
 *   const ctx = useContextMenu<TItem>();
 *   <ModuleListItem onContextMenu={(e) => ctx.open(e, item)} ...>
 *   Then render <ContextMenu items={getItems(ctx.state.data)} ...> in the list root.
 */
export declare function ModuleListItem({ selected, children, onContextMenu, }: ModuleListItemProps): JSX.Element;
