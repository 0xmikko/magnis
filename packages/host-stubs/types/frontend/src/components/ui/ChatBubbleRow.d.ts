import type { ReactNode, JSX } from "react";
export interface ChatBubbleRowProps {
    /** Whether this is an inbound (left) or outbound (right) message */
    readonly align: "start" | "end";
    /** Extra className */
    readonly className?: string;
    readonly children: ReactNode;
}
/**
 * A row that constrains and aligns a chat bubble (max-width 75%).
 */
export declare function ChatBubbleRow({ align, className, children }: ChatBubbleRowProps): JSX.Element;
