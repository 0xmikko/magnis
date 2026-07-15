import type { JSX } from "react";
export interface CheckboxProps {
    /** Whether the checkbox is checked */
    readonly checked?: boolean;
    /** Extra className */
    readonly className?: string;
    /** Click handler */
    readonly onClick?: () => void;
}
/**
 * A visual checkbox indicator. Supports optional onClick for interactivity.
 */
export declare function Checkbox({ checked, className, onClick }: CheckboxProps): JSX.Element;
