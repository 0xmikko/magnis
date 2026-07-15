import type { ReactNode, JSX } from "react";
export interface ChatComposerProps {
    readonly placeholder: string;
    readonly modePills?: readonly string[];
    readonly attachButton?: ReactNode;
    readonly activePillIndex?: number;
}
/**
 * Chat input bar with optional mode pills and attach button.
 * Used in inbox module and agent module.
 */
export declare function ChatComposer({ placeholder, modePills, attachButton, activePillIndex, }: ChatComposerProps): JSX.Element;
