import type { ReactNode, JSX } from "react";
export interface EmptyStateProps {
    /** Icon element displayed in the placeholder */
    readonly icon: ReactNode;
    /** Heading text */
    readonly title: string;
    /** Supporting description */
    readonly subtitle?: string;
    /** Extra className */
    readonly className?: string;
}
/**
 * Centered empty-state placeholder with icon, title, and optional subtitle.
 */
export declare function EmptyState({ icon, title, subtitle, className }: EmptyStateProps): JSX.Element;
