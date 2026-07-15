import type { ReactNode, JSX } from "react";
export interface LinkedItemProps {
    /** Icon element */
    readonly icon: ReactNode;
    /** Label text */
    readonly title: string;
    /** Extra className */
    readonly className?: string;
}
/**
 * An item row with a small icon box and a label.
 * Used for linked items in task cards, references, etc.
 */
export declare function LinkedItem({ icon, title, className }: LinkedItemProps): JSX.Element;
