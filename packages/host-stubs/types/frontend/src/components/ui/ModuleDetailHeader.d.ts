import type { ReactNode, JSX } from "react";
export interface ModuleDetailHeaderProps {
    readonly left: ReactNode;
    readonly actions?: ReactNode;
}
/**
 * Standard detail pane header with left info and right actions.
 * Used across all plugin detail views.
 */
export declare function ModuleDetailHeader({ left, actions }: ModuleDetailHeaderProps): JSX.Element;
