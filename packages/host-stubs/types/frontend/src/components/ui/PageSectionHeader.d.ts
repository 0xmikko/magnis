import type { ReactNode, JSX } from "react";
export interface PageSectionHeaderProps {
    readonly title: string;
    readonly description?: string;
    readonly actions?: ReactNode;
    readonly className?: string;
}
/**
 * Shared compact page header for in-pane module pages.
 */
export declare function PageSectionHeader({ title, description, actions, className, }: PageSectionHeaderProps): JSX.Element;
