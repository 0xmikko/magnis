import type { JSX } from "react";
export interface ConfirmDialogProps {
    readonly open: boolean;
    readonly title: string;
    readonly message: string;
    /** Optional secondary detail text (e.g. disk size warning). */
    readonly detail?: string;
    readonly confirmLabel?: string;
    readonly cancelLabel?: string;
    /** Use "danger" for destructive actions (red confirm button). */
    readonly variant?: "default" | "danger";
    readonly onConfirm: () => void;
    readonly onCancel: () => void;
}
export declare function ConfirmDialog({ open, title, message, detail, confirmLabel, cancelLabel, variant, onConfirm, onCancel, }: ConfirmDialogProps): JSX.Element | null;
