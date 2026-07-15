import type { ReactNode, JSX } from "react";
export interface EntityHeaderProps {
    /** Avatar element (Avatar component or custom) */
    readonly avatar: ReactNode;
    /** Primary name / title */
    readonly name: string;
    /** Subtitle line (e.g. "CTO at TechVentures · Berlin") */
    readonly subtitle?: string;
    /** Meta line (e.g. phone · handle · date) */
    readonly meta?: string;
    /** Tags rendered below the meta line */
    readonly tags?: ReactNode;
    /** Action buttons (top-right corner, e.g. three-dot menu) */
    readonly actions?: ReactNode;
    /** Extra className */
    readonly className?: string;
}
/**
 * Generic entity detail header with avatar, name, subtitle, meta, and tags.
 * Used for contacts, companies, projects, and other entity detail pages.
 * Layout: avatar on the left, stacked info to the right, actions top-right.
 */
export declare function EntityHeader({ avatar, name, subtitle, meta, tags, actions, className, }: EntityHeaderProps): JSX.Element;
