import type { ReactNode, JSX } from "react";
export interface StackProps {
    /** Gap between children (Tailwind spacing scale: 0, 0.5, 1, 2, 3…) */
    readonly gap?: number;
    /** Uniform padding */
    readonly p?: number;
    /** Horizontal padding */
    readonly px?: number;
    /** Vertical padding */
    readonly py?: number;
    /** Take remaining flex space */
    readonly flex1?: boolean;
    /** Truncate overflowing text children */
    readonly truncate?: boolean;
    /** Cross-axis alignment */
    readonly align?: "start" | "center" | "end" | "stretch";
    /** Main-axis justification */
    readonly justify?: "start" | "center" | "end" | "between";
    /** Full height */
    readonly fullHeight?: boolean;
    /** Extra className (positioning, margins only) */
    readonly className?: string;
    readonly children: ReactNode;
}
export declare function Stack({ gap, p, px, py, flex1, truncate, align, justify, fullHeight, className, children, }: StackProps): JSX.Element;
