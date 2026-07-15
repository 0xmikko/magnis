import type { JSX } from "react";
export interface ProjectItemProps {
    /** Project name */
    readonly name: string;
    /** Task count */
    readonly count: string;
    /** Dot color (Tailwind bg class token: "green", "blue", "orange", "red") */
    readonly dotColor: string;
    /** Extra className */
    readonly className?: string;
}
/**
 * A project row with a colored dot, name, and count.
 */
export declare function ProjectItem({ name, count, dotColor, className }: ProjectItemProps): JSX.Element;
