import type { JSX } from "react";
import type { EntityMention, ReplyToContext } from "../../modules/episodes/types";
import type { AppRuntime } from "../../runtime/contracts/runtime";
export interface ModelSelectorItem {
    readonly id: string;
    readonly label: string;
    readonly section: "agent" | "model";
    readonly engineName: string;
    readonly modelId?: string;
}
export interface PendingAttachment {
    readonly id: string;
    readonly name: string;
    readonly mimeType: string;
}
export interface ComposerSharedProps {
    readonly isStreaming: boolean;
    readonly onSend: (text: string, mentions: readonly EntityMention[]) => void;
    readonly onStop: () => void;
    readonly selectorItems?: readonly ModelSelectorItem[];
    readonly currentSelection?: ModelSelectorItem | null;
    readonly onSelectionChange?: (item: ModelSelectorItem) => void;
    readonly replyTo?: ReplyToContext | null;
    readonly onClearReplyTo?: () => void;
    readonly runtime?: AppRuntime;
    readonly onAttachFile?: () => void;
    readonly pendingAttachments?: readonly PendingAttachment[];
    readonly onRemoveAttachment?: (id: string) => void;
}
export declare function ReplyToBar({ replyTo, runtime, onDismiss, }: {
    readonly replyTo: ReplyToContext | null;
    readonly runtime: AppRuntime;
    readonly onDismiss: () => void;
}): JSX.Element | null;
export declare function AgentLandingComposer({ isStreaming, onSend, onStop, selectorItems, currentSelection, onSelectionChange, replyTo, onClearReplyTo, runtime, onAttachFile, pendingAttachments, onRemoveAttachment, }: ComposerSharedProps): JSX.Element;
export declare function AgentDockedComposer({ isStreaming, onSend, onStop, selectorItems, currentSelection, onSelectionChange, replyTo, onClearReplyTo, runtime, onAttachFile, pendingAttachments, onRemoveAttachment, }: ComposerSharedProps): JSX.Element;
