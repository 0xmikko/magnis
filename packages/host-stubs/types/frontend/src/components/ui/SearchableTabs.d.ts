import type { JSX } from "react";
import type { IconName } from "./Icon";
export interface SearchableTab {
    readonly id: string;
    readonly label: string;
}
export interface SearchCategory {
    readonly id: string;
    readonly label: string;
    readonly icon?: IconName;
}
export interface SearchFilterButton {
    readonly id: string;
    readonly icon: IconName;
    readonly label?: string;
    readonly active?: boolean;
}
export interface SearchableTabsProps {
    /** Tab definitions */
    readonly tabs: readonly SearchableTab[];
    /** Currently active tab id */
    readonly activeTab: string;
    /** Called when user selects a tab */
    readonly onTabChange: (tabId: string) => void;
    /** Enable the search feature (shows search icon) */
    readonly searchable?: boolean;
    /** Placeholder text for the search input */
    readonly searchPlaceholder?: string;
    /** Category filter pills shown in search mode */
    readonly searchCategories?: readonly SearchCategory[];
    /** Filter buttons (e.g. person, calendar) shown in the search toolbar */
    readonly searchFilters?: readonly SearchFilterButton[];
    /** Called when search query or active category changes */
    readonly onSearch?: (query: string, categoryId: string) => void;
    /** Number of search results to display */
    readonly searchResultCount?: number;
    /** Label for search results (e.g. "results for") */
    readonly searchResultLabel?: string;
    /** Called when user clicks prev/next in search navigation */
    readonly onSearchNavigate?: (direction: "prev" | "next") => void;
    /** Called when a filter button is toggled */
    readonly onFilterToggle?: (filterId: string) => void;
    /** Max visible tabs before showing "..." overflow button. No limit if omitted. */
    readonly maxVisibleTabs?: number;
    /** Extra className */
    readonly className?: string;
}
/**
 * A horizontal tab bar with an integrated search mode.
 *
 * Normal mode: shows tab buttons with an optional search icon on the right.
 * Search mode: replaces tabs with a search toolbar, nav arrows, filter icons,
 * and category filter pills.
 *
 * Generic — works for contacts, companies, projects, or any entity detail view.
 */
export declare function SearchableTabs({ tabs, activeTab, onTabChange, searchable, searchPlaceholder, searchCategories, searchFilters, onSearch, searchResultCount, searchResultLabel, onSearchNavigate, onFilterToggle, maxVisibleTabs, className, }: SearchableTabsProps): JSX.Element;
