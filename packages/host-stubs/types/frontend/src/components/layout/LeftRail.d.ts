import type { ReactNode, JSX } from "react";
export interface ModuleIcon {
    readonly id: string;
    readonly icon: ReactNode;
    readonly label: string;
    readonly active?: boolean;
    readonly onClick: () => void;
    /** Extension icons are user-reorderable; pinned Core entries are not. */
    readonly reorderable?: boolean;
}
/** Where a drop would land relative to the hovered icon. */
type DropPosition = "before" | "after";
export interface LeftRailProps {
    readonly modules: readonly ModuleIcon[];
    readonly bottomModules?: readonly ModuleIcon[];
    readonly footer?: ReactNode;
    /** Fired when a reorderable icon is dropped, inserting it before/after the
     *  hovered reorderable icon. */
    readonly onReorder?: (dragId: string, overId: string, position: DropPosition) => void;
}
/**
 * Left navigation rail with module icons and labels
 */
export declare function LeftRail({ modules, bottomModules, footer, onReorder, }: LeftRailProps): JSX.Element;
export {};
