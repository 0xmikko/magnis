import type { JSX } from "react";
export interface DividerProps {
    /** Extra className (margins only) */
    readonly className?: string;
}
/**
 * A horizontal divider line.
 */
export declare function Divider({ className }: DividerProps): JSX.Element;
