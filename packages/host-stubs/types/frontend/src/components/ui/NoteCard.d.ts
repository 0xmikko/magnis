import type { JSX } from "react";
export interface NoteCardProps {
    /** Note body text */
    readonly content: string;
    /** Metadata line below the note */
    readonly meta: string;
    /** Extra className */
    readonly className?: string;
}
/**
 * A bordered note card with content and metadata.
 */
export declare function NoteCard({ content, meta, className }: NoteCardProps): JSX.Element;
