import type { JSX } from "react";
export interface Tab {
    readonly id: string;
    readonly label: string;
}
export interface TabBarProps {
    readonly tabs: readonly Tab[];
    readonly activeTab: string;
    readonly onTabChange: (tabId: string) => void;
}
/**
 * A horizontal tab bar with underline-style active indicator.
 * Uses explicit id/label pairs for reliable matching.
 * Used in contacts, companies, and other plugin detail views.
 */
export declare function TabBar({ tabs, activeTab, onTabChange }: TabBarProps): JSX.Element;
