import type { ReactNode, JSX } from "react";
export interface IconBoxProps {
    /** Icon element to display */
    readonly children: ReactNode;
    /** Size variant */
    readonly size?: "xs" | "sm" | "md";
    /** Extra className */
    readonly className?: string;
}
/**
 * A small, rounded container for an icon. Used as leading element in activity rows.
 */
export declare function IconBox({ children, size, className }: IconBoxProps): JSX.Element;
