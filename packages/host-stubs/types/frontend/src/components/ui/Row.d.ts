import type { ReactNode, JSX } from "react";
export interface RowProps {
    /** Gap between children (Tailwind spacing scale) */
    readonly gap?: number;
    /** Uniform padding */
    readonly p?: number;
    /** Horizontal padding */
    readonly px?: number;
    /** Vertical padding */
    readonly py?: number;
    /** Cross-axis alignment */
    readonly align?: "start" | "center" | "end" | "stretch" | "baseline";
    /** Main-axis justification */
    readonly justify?: "start" | "center" | "end" | "between";
    /** Take remaining flex space */
    readonly flex1?: boolean;
    /** Truncate overflowing content */
    readonly truncate?: boolean;
    /** Allow wrapping */
    readonly wrap?: boolean;
    /** Extra className (positioning, margins only) */
    readonly className?: string;
    readonly children: ReactNode;
}
export declare function Row({ gap, p, px, py, align, justify, flex1, truncate, wrap, className, children, }: RowProps): JSX.Element;
