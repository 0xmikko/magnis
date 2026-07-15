import type { ReactNode, JSX } from "react";
export interface SidebarRightHeaderProps {
    readonly title: string;
    readonly closeButton?: ReactNode;
}
/**
 * Standard header for the right sidebar panel with title and close button.
 */
export declare function SidebarRightHeader({ title, closeButton }: SidebarRightHeaderProps): JSX.Element;
