import type { JSX } from "react";
export type TaskStatusColor = "accent" | "blue" | "purple" | "green" | "amber" | "red" | "neutral";
export interface TaskStatusCardProps {
    /** Task title */
    readonly title: string;
    /** Status label (e.g. "Active", "In Progress") */
    readonly status: string;
    /** Status color */
    readonly statusColor: TaskStatusColor;
    /** Description after the status */
    readonly description: string;
    /** Show action icons (plus, clock, kebab) */
    readonly showActions?: boolean;
    /** Click handler */
    readonly onClick?: () => void;
    /** Extra className */
    readonly className?: string;
}
/**
 * Task card with title, action icons, and colored status text.
 * Matches B1 Pencil design — used for Tasks section.
 */
export declare function TaskStatusCard({ title, status, statusColor, description, showActions, onClick, className, }: TaskStatusCardProps): JSX.Element;
