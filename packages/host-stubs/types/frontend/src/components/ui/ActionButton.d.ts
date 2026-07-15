import type { JSX } from "react";
export interface ActionButtonProps {
    readonly label: string;
    readonly variant?: "default" | "primary" | "danger";
    readonly icon?: string;
    readonly onClick?: () => void;
}
/**
 * Action button used in meeting cards, email detail, etc.
 */
export declare function ActionButton({ label, variant, icon, onClick }: ActionButtonProps): JSX.Element;
