import type { JSX } from "react";
export interface AttachmentLabelProps {
    /** File name */
    readonly name: string;
    /** File size display */
    readonly size?: string;
    /** Extra className */
    readonly className?: string;
}
/**
 * A small attachment indicator with a file icon, name, and optional size.
 */
export declare function AttachmentLabel({ name, size, className }: AttachmentLabelProps): JSX.Element;
