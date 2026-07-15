import type { JSX } from "react";
export interface AgentChatMessageProps {
    /** Role label displayed above the bubble */
    readonly roleLabel: string;
    /** Message content */
    readonly content: string;
    /** Whether this is a user message (right-aligned, accent) or assistant (left-aligned, surface) */
    readonly isUser: boolean;
    /** Extra className */
    readonly className?: string;
}
/**
 * A role-labeled chat message bubble for agent conversations.
 */
export declare function AgentChatMessage({ roleLabel, content, isUser, className, }: AgentChatMessageProps): JSX.Element;
