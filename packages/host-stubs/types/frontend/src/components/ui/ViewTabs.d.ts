import type { JSX } from "react";
export interface ViewTab {
    readonly id: string;
    readonly label: string;
}
export interface ViewTabsProps {
    readonly tabs: readonly ViewTab[];
    readonly activeTab: string;
    readonly onTabChange: (tabId: string) => void;
    readonly title?: string;
}
/**
 * Pill-style view switcher tabs (e.g. Detail / Day / Week / Month).
 * Used in meetings, tasks, and other views with multiple sub-views.
 */
export declare function ViewTabs({ tabs, activeTab, onTabChange, title }: ViewTabsProps): JSX.Element;
