import type { JSX } from "react";
export interface NavArrowsProps {
    /** Center label (e.g. date range) */
    readonly label: string;
    /** Extra className */
    readonly className?: string;
    /** Previous click handler */
    readonly onPrev?: () => void;
    /** Next click handler */
    readonly onNext?: () => void;
}
/**
 * Previous / label / next arrow navigation row.
 * Used in calendar week-view navigation.
 */
export declare function NavArrows({ label, className, onPrev, onNext }: NavArrowsProps): JSX.Element;
