import type { ReactNode, JSX } from "react";
export interface ScrollableProps {
    /** Uniform padding */
    readonly p?: number;
    /** Horizontal padding */
    readonly px?: number;
    /** Vertical padding */
    readonly py?: number;
    /** Extra className (positioning, margins only) */
    readonly className?: string;
    readonly children: ReactNode;
}
/**
 * A flex-1 scrollable container. Place inside a full-height flex column.
 */
export declare function Scrollable({ p, px, py, className, children }: ScrollableProps): JSX.Element;
