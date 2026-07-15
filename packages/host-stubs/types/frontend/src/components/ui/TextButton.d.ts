import type { JSX } from "react";
export interface TextButtonProps {
    /** Button label */
    readonly label: string;
    /** Color variant */
    readonly variant?: "accent" | "default";
    /** Extra className */
    readonly className?: string;
}
/**
 * A minimal text-only button (no background/border).
 */
export declare function TextButton({ label, variant, className }: TextButtonProps): JSX.Element;
