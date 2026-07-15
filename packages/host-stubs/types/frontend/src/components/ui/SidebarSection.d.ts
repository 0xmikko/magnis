import type { ReactNode, JSX } from "react";
export interface SidebarSectionProps {
    readonly title: string;
    readonly pill?: string;
    readonly children: ReactNode;
}
/**
 * A section in the right sidebar with a title and optional count pill.
 * Used across inbox, emails, meetings, companies, tasks sidebars.
 */
export declare function SidebarSection({ title, pill, children }: SidebarSectionProps): JSX.Element;
