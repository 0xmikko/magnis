import type { JSX } from "react";
import type { PendingToolCall } from "../../modules/episodes/types";
export interface ToolDraftCardProps {
    readonly variant: "telegram" | "gmail";
    readonly toolCall?: PendingToolCall;
    readonly title: string;
    readonly body: string;
    readonly isAllowlisted?: boolean;
    readonly superseded?: boolean;
    readonly onSend?: () => Promise<void> | void;
    readonly onEdit?: () => void;
    readonly onAllowlistToggle?: () => void;
}
export declare function ToolDraftCard({ variant, toolCall, title, body, isAllowlisted, superseded, onSend, onEdit: _onEdit, onAllowlistToggle, }: ToolDraftCardProps): JSX.Element;
export interface EmailPreviousMessage {
    readonly senderName?: string;
    readonly date?: string;
    readonly text: string;
}
export interface EmailDraftCardProps {
    readonly toolCall?: PendingToolCall;
    readonly from?: string;
    readonly to?: string;
    readonly toName?: string;
    readonly subject?: string;
    readonly body: string;
    readonly previousMessage?: EmailPreviousMessage;
    readonly attachmentNames?: readonly string[];
    readonly isAllowlisted?: boolean;
    readonly superseded?: boolean;
    readonly onSend?: () => Promise<void> | void;
    readonly onEdit?: () => void;
    readonly onAllowlistToggle?: () => void;
}
export declare function EmailDraftCard({ toolCall, from, to, toName, subject, body, previousMessage, attachmentNames, isAllowlisted, superseded, onSend, onEdit, onAllowlistToggle, }: EmailDraftCardProps): JSX.Element;
