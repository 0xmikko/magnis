import type { JSX } from "react";
import type { EntityMention, ReplyToContext } from "../../modules/episodes/types";
import type { AppRuntime } from "../../runtime/contracts/runtime";
import type { UseModelSelectorResult } from "../../modules/settings/hooks/useModelSelector";
export type { ModelSelectorItem } from "../../modules/settings/hooks/useModelSelector";
export interface PendingAttachment {
    readonly id: string;
    readonly name: string;
    readonly mimeType: string;
}
export interface ComposerSharedProps {
    readonly openDelegations?: number | null;
    readonly totalTokens?: number | null;
    readonly onDelegationsClick?: () => void;
    readonly isStreaming: boolean;
    /** Durable Episode work may be stoppable while it waits for user input. */
    readonly stopAvailable?: boolean;
    readonly disabledReason?: string | null;
    readonly onSend: (text: string, mentions: readonly EntityMention[]) => void | Promise<void>;
    readonly onStop: () => void;
    readonly selector?: UseModelSelectorResult;
    readonly replyTo?: ReplyToContext | null;
    readonly onClearReplyTo?: () => void;
    readonly runtime?: AppRuntime;
    readonly onAttachFile?: () => void;
    readonly pendingAttachments?: readonly PendingAttachment[];
    readonly onRemoveAttachment?: (id: string) => void;
}
export declare function AgentSelectionCaption({ selector, openDelegations, totalTokens, onDelegationsClick, }: {
    readonly openDelegations?: number | null;
    readonly totalTokens?: number | null;
    readonly onDelegationsClick?: () => void;
    readonly selector?: UseModelSelectorResult;
}): JSX.Element | null;
export declare function ReplyToBar({ replyTo, runtime, onDismiss, }: {
    readonly replyTo: ReplyToContext | null;
    readonly runtime: AppRuntime;
    readonly onDismiss: () => void;
}): JSX.Element | null;
export declare function AgentLandingComposer({ isStreaming, stopAvailable, disabledReason, onSend, onStop, selector, replyTo, onClearReplyTo, runtime, onAttachFile, pendingAttachments, onRemoveAttachment, openDelegations, totalTokens, onDelegationsClick, }: ComposerSharedProps): JSX.Element;
export declare function AgentDockedComposer({ isStreaming, stopAvailable, disabledReason, onSend, onStop, selector, replyTo, onClearReplyTo, runtime, onAttachFile, pendingAttachments, onRemoveAttachment, openDelegations, totalTokens, onDelegationsClick, }: ComposerSharedProps): JSX.Element;
