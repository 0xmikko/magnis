import type { JSX } from "react";
export interface ActionButtonProps {
    readonly label: string;
    readonly variant?: "default" | "primary" | "danger";
    /** Visual weight. `md` is the default and unchanged; `sm` for dense panels. */
    readonly size?: "sm" | "md";
    readonly icon?: string;
    readonly onClick?: () => void;
}
/**
 * Action button used in meeting cards, email detail, etc.
 */
export declare function ActionButton({ label, variant, size, icon, onClick }: ActionButtonProps): JSX.Element;
