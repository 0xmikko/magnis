/**
 * ContactCreateRenderer — approval card for contacts.create (single contact).
 */

import type { JSX } from "react";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";

export function ContactCreateRenderer({
  payload,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args as Record<string, unknown>;

  const name = (args.name as string | undefined) ?? "";
  const email = (args.email as string | undefined) ?? "";
  const phone = (args.phone as string | undefined) ?? "";
  const company = (args.company as string | undefined) ?? "";
  const role = (args.role as string | undefined) ?? "";

  const field = (label: string, value: string): JSX.Element | null => {
    if (!value) return null;
    return (
      <div className="mb-1 flex items-baseline gap-1 text-[11px]">
        <span className="shrink-0 w-16 text-[var(--color-agent-tool-purple-text)]">{label}:</span>
        <span className="rounded border border-transparent px-1 py-0.5 text-agent-text">{value}</span>
      </div>
    );
  };

  return (
    <BaseToolCallCard
      icon="user"
      title={`Create contact: ${name}`}
      variant="purple"
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
      {field("Email", email)}
      {field("Phone", phone)}
      {field("Company", company)}
      {field("Role", role)}
    </BaseToolCallCard>
  );
}
