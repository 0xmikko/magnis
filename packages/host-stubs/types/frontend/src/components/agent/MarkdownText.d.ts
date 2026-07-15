import type { JSX } from "react";
import type { AvatarColor } from "../../modules/shared/types";
export declare function sourceBg(color: AvatarColor | undefined): string;
export interface MarkdownTextProps {
    readonly text: string;
    readonly className?: string;
}
export declare function MarkdownText({ text, className }: MarkdownTextProps): JSX.Element;
