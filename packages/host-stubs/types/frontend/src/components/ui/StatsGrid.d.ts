import type { JSX } from "react";
export interface StatCard {
    readonly value: string;
    readonly label: string;
}
export interface StatsGridProps {
    readonly stats: readonly StatCard[];
}
/**
 * 2-column grid of stat cards showing value/label pairs.
 * Used in contacts sidebar, tasks sidebar.
 */
export declare function StatsGrid({ stats }: StatsGridProps): JSX.Element;
