import type { JSX } from "react";
import { type MentionSuggestionConfig } from "./markdown/useMentionEditorUI";
import "./MarkdownEditor.css";
export interface MarkdownEditorProps {
    readonly initialValue: string;
    readonly onChange: (markdown: string) => void;
    readonly placeholder?: string;
    readonly readOnly?: boolean;
    readonly className?: string;
    readonly autoFocus?: boolean;
    readonly mentionSuggestion?: MentionSuggestionConfig;
}
export declare function MarkdownEditor(props: MarkdownEditorProps): JSX.Element;
