import type { JSX } from "react";
export interface AddButtonProps {
    /** Extra className */
    readonly className?: string;
    /** Click handler */
    readonly onClick?: () => void;
}
/**
 * A small "+" button used in section headers.
 */
export declare function AddButton({ className, onClick }: AddButtonProps): JSX.Element;
