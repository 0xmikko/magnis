import type { ReactNode, JSX } from "react";
export interface CardProps {
    /** Uniform padding (Tailwind spacing scale) */
    readonly p?: number;
    /** Reduce opacity (e.g. completed state) */
    readonly dimmed?: boolean;
    /** Border radius variant */
    readonly rounded?: "md" | "lg" | "xl";
    /** Extra className (margins only) */
    readonly className?: string;
    readonly children: ReactNode;
}
export declare function Card({ p, dimmed, rounded, className, children, }: CardProps): JSX.Element;
