import type { ReactNode, JSX } from "react";
export type ChatBubbleKind = "inbound" | "outbound" | "email" | "email-outbound" | "system";
export interface ChatBubbleProps {
    readonly kind: ChatBubbleKind;
    readonly children: ReactNode;
    readonly channelLabel?: ReactNode;
    readonly title?: string;
    readonly time: string;
    readonly delivered?: boolean;
    readonly attachment?: ReactNode;
}
/**
 * A chat message bubble supporting multiple kinds (inbound, outbound, email, system).
 * Used in inbox chat and agent chat views.
 */
export declare function ChatBubble({ kind, children, channelLabel, title, time, delivered, attachment, }: ChatBubbleProps): JSX.Element;
