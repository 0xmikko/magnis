import type { JSX } from "react";
export interface SubtaskItemProps {
    /** Subtask title */
    readonly title: string;
    /** Metadata (due date, assignee) */
    readonly meta?: string;
    /** Whether the subtask is completed */
    readonly done?: boolean;
    /** Extra className */
    readonly className?: string;
}
/**
 * A subtask row with checkbox, title, and optional meta.
 */
export declare function SubtaskItem({ title, meta, done, className }: SubtaskItemProps): JSX.Element;
