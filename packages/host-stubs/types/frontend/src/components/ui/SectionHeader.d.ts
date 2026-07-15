import type { ReactNode, JSX } from "react";
export interface SectionHeaderProps {
    /** Section title text */
    readonly title: string;
    /** Optional action element (e.g. add button) */
    readonly action?: ReactNode;
    /** Extra className */
    readonly className?: string;
}
/**
 * A section header with title and optional trailing action.
 * Used for "Notes", "Tags", "Stats", "Team" sections in sidebars.
 */
export declare function SectionHeader({ title, action, className }: SectionHeaderProps): JSX.Element;
