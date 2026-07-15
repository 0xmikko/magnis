export { sourceBg, MarkdownText } from "./MarkdownText";
export type { MarkdownTextProps } from "./MarkdownText";
export { AllowlistDropdown, ToolApprovalCard } from "./ToolApprovalCard";
export type { ToolApprovalCardProps } from "./ToolApprovalCard";
export { ToolDraftCard, EmailDraftCard } from "./DraftCards";
export type { ToolDraftCardProps, EmailDraftCardProps, EmailPreviousMessage } from "./DraftCards";
export { AgentMessageList } from "./MessageList";
export type { AgentMessageListProps } from "./MessageList";
export { DecisionSummary } from "./DecisionSummary";
export type { DecisionSummaryProps } from "./DecisionSummary";
export { PendingPromptPanel } from "./PendingPromptPanel";
export type { PendingPromptPanelProps } from "./PendingPromptPanel";
export { AgentLandingComposer, AgentDockedComposer, ReplyToBar, } from "./ComposerPanels";
export type { ModelSelectorItem, ComposerSharedProps } from "./ComposerPanels";
import type { JSX } from "react";
import type { IconName } from "../ui/Icon";
import type { AppRuntime } from "../../runtime/contracts/runtime";
export interface AgentPanelHeaderTitleProps {
    readonly title: string;
    readonly sourceIconName?: IconName;
    readonly sourceColorClassName?: string;
}
export declare function AgentPanelHeaderTitle({ title, sourceIconName, sourceColorClassName, }: AgentPanelHeaderTitleProps): JSX.Element;
export interface ExtractEntitiesOptions {
    readonly toolName?: string;
    readonly defaultSchemaId?: string;
}
export declare function extractEntities(result: unknown, opts?: ExtractEntitiesOptions): readonly Readonly<Record<string, unknown>>[];
export interface ToolResultEntityCardsProps {
    readonly toolName: string;
    readonly result: unknown;
    readonly runtime: AppRuntime;
}
export declare function ToolResultEntityCards({ toolName: _toolName, result, runtime, }: ToolResultEntityCardsProps): JSX.Element;
