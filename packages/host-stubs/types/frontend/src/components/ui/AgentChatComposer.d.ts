import type { ReactNode, JSX } from "react";
export interface AgentChatComposerProps {
    /** Input placeholder text */
    readonly placeholder: string;
    /** Optional leading action (e.g. attach button) */
    readonly leadingAction?: ReactNode;
    /** Extra className */
    readonly className?: string;
}
/**
 * A chat input bar with optional attach button and send button.
 * Used in agent module conversations.
 */
export declare function AgentChatComposer({ placeholder, leadingAction, className, }: AgentChatComposerProps): JSX.Element;
