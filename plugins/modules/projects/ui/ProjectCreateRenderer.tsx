import type { JSX } from "react";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";

export function ProjectCreateRenderer({
  payload,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const {
    toolCall: tc,
    toolResult,
    isAllowlisted,
    superseded,
    onApprove,
    onDeny,
    onAllowlistToggle,
  } = payload;
  const args = tc.args as Record<string, unknown>;
  const name = typeof args.name === "string" && args.name.length > 0
    ? args.name
    : "Untitled project";
  const status = typeof args.status === "string" && args.status.length > 0
    ? args.status
    : "";

  const field = (label: string, value: string): JSX.Element | null => {
    if (!value) return null;
    return (
      <div className="mb-1 flex items-baseline gap-1 text-[11px]">
        <span className="shrink-0 w-16 text-[var(--color-agent-tool-sky-text)]">{label}:</span>
        <span className="rounded border border-transparent px-1 py-0.5 text-agent-text">{value}</span>
      </div>
    );
  };

  return (
    <BaseToolCallCard
      icon="briefcase"
      title={`Create project: ${name}`}
      variant="sky"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      primaryLabel="Create"
      primaryIcon="check"
      doneLabel="Created"
      onApprove={onApprove}
      onDeny={onDeny}
      onAllowlistToggle={onAllowlistToggle}
    >
      {field("Name", name)}
      {field("Status", status)}
    </BaseToolCallCard>
  );
}
