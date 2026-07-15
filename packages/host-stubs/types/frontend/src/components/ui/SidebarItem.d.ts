import type { ReactNode, JSX } from "react";
export interface SidebarItemProps {
    readonly icon: ReactNode;
    readonly title: string;
    readonly subtitles?: readonly string[];
    readonly actionLabel?: string;
    readonly tone?: "default" | "highlight" | "muted";
}
/**
 * An item inside a SidebarSection.
 * Shows an icon, title, optional subtitles, and an optional action button.
 */
export declare function SidebarItem({ icon, title, subtitles, actionLabel, tone, }: SidebarItemProps): JSX.Element;
