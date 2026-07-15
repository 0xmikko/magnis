import type { JSX } from "react";
import type { PendingToolCall } from "../../modules/episodes/types";
export declare function AllowlistDropdown({ isAllowlisted, onToggle, }: {
    readonly isAllowlisted: boolean;
    readonly onToggle: () => void;
}): JSX.Element;
export interface ToolApprovalCardProps {
    readonly toolCall: PendingToolCall;
    readonly onApprove: () => Promise<void> | void;
    readonly onDeny: () => Promise<void> | void;
}
export declare function ToolApprovalCard({ toolCall, onApprove, onDeny, }: ToolApprovalCardProps): JSX.Element;
