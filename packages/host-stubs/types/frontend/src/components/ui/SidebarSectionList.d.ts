import type { JSX } from "react";
import type { IconName } from "./Icon";
export interface SidebarSectionItemData {
    readonly icon: IconName;
    readonly title: string;
    readonly subtitles: readonly string[];
    readonly actionLabel?: string;
    readonly tone?: "default" | "highlight" | "muted";
}
export interface SidebarSectionData {
    readonly title: string;
    readonly pill?: string;
    readonly items: readonly SidebarSectionItemData[];
}
export interface SidebarSectionListProps {
    readonly sections: readonly SidebarSectionData[];
}
/**
 * Renders a list of sidebar sections with items.
 * Shared across Inbox, Emails, Meetings, and Companies sidebar views.
 */
export declare function SidebarSectionList({ sections }: SidebarSectionListProps): JSX.Element;
