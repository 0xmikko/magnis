import { type JSX } from "react";
export interface MessageComposerAttachment {
    readonly id: string;
    readonly name: string;
    readonly mimeType?: string;
}
export interface MessageComposerProps {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly onSend?: () => void;
    readonly placeholder?: string;
    readonly rows?: number;
    readonly disabled?: boolean;
    readonly sendOnEnter?: boolean;
    /** "stacked" — textarea + toolbar below (default). "inline" — single-line input with icons on the sides. */
    readonly layout?: "stacked" | "inline";
    /** Icon name for the send button. Default: "arrow-up". */
    readonly sendIcon?: "arrow-up" | "send";
    /** Tailwind class for the send icon color (e.g. "text-[#6AB2F2]"). */
    readonly sendIconClassName?: string;
    /**
     * When true, the attach (paperclip) button is NOT rendered.
     * Per DEC-3 / INV-11: telegram mode has no attachment plumbing.
     */
    readonly hideAttach?: boolean;
    /**
     * When provided, the paperclip becomes interactive and fires this on click.
     * Shell stays mode-agnostic: wrapper decides what clicking means.
     */
    readonly onAttachClick?: () => void;
    /** Attachment chips rendered above the textarea (stacked) or above the inline row. */
    readonly attachments?: readonly MessageComposerAttachment[];
    /** Fired when the chip × is clicked. */
    readonly onRemoveAttachment?: (id: string) => void;
    /** Optional error text rendered below the composer (e.g. upload failure). */
    readonly errorText?: string;
    /**
     * Optional `data-testid` applied to the underlying `<textarea>`.
     * Used by wrappers (`TelegramReplyComposer`, `EmailReplyComposer`) so E2E
     * specs can locate the composer input without coupling to class names.
     */
    readonly textareaTestId?: string;
}
export declare function MessageComposer({ value, onChange, onSend, placeholder, rows, disabled, sendOnEnter, layout, sendIcon, sendIconClassName, hideAttach, onAttachClick, attachments, onRemoveAttachment, errorText, textareaTestId, }: MessageComposerProps): JSX.Element;
