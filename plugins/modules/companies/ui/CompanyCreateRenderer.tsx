/**
 * CompanyCreateRenderer — approval card for companies.create.
 *
 * Without this the gate falls back to the generic "Agent wants to: companies
 * create" card, which hides WHICH company is being created. Mirrors
 * ContactCreateRenderer.
 */

import type { JSX } from "react";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";

export function CompanyCreateRenderer({
  payload,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args as Record<string, unknown>;

  const name = (args.name as string | undefined) ?? "";
  const domain = (args.domain as string | undefined) ?? "";
  const website = (args.website as string | undefined) ?? "";
  const industry = (args.industry as string | undefined) ?? "";
  const summary = (args.summary as string | undefined) ?? "";

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
      icon="building"
      title={`Create company: ${name}`}
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
      {field("Domain", domain)}
      {field("Website", website)}
      {field("Industry", industry)}
      {field("About", summary)}
    </BaseToolCallCard>
  );
}
