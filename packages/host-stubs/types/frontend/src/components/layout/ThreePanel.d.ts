import { type ReactNode } from "react";
import type { JSX } from "react";
export interface ThreePanelProps {
    readonly listPane: ReactNode;
    readonly detailPane: ReactNode;
    readonly sidebarPane?: ReactNode;
    readonly storageKey?: string;
    readonly containerClassName?: string;
    readonly listPaneClassName?: string;
    readonly detailPaneClassName?: string;
    readonly sidebarPaneClassName?: string;
    readonly listHandleBackground?: string;
    readonly sidebarHandleBackground?: string;
}
/**
 * Shared three-pane layout:
 * - left list pane (bounded, resizable)
 * - center detail pane (dominant, flexible)
 * - optional right sidebar pane (bounded, resizable)
 */
export declare function ThreePanel({ listPane, detailPane, sidebarPane, storageKey, containerClassName, listPaneClassName, detailPaneClassName, sidebarPaneClassName, listHandleBackground, sidebarHandleBackground, }: ThreePanelProps): JSX.Element;
