/**
 * CompanyCreateRenderer — approval card for companies.create/update.
 *
 * Without this the gate falls back to the generic "Agent wants to: companies
 * create/update" card, which hides which fields will change. Mirrors the
 * project create/update renderer.
 */

import type { JSX } from "react";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";

export function CompanyCreateRenderer({
  payload,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args as Record<string, unknown>;

  const isUpdate = tc.name === "companies.update" ||
    tc.name === "companies_update" ||
    tc.name === "company.update" ||
    tc.name === "company_update";
  const name = (args.name as string | undefined) ?? "";
  const domain = (args.domain as string | undefined) ?? "";
  const website = (args.website as string | undefined) ?? "";
  const industry = (args.industry as string | undefined) ?? "";
  const summary = (args.summary as string | undefined) ?? "";
  const size = (args.size as string | undefined) ?? "";
  const location = (args.location as string | undefined) ?? "";
  const founded = (args.founded as string | undefined) ?? "";
  const stage = (args.stage as string | undefined) ?? "";
  const headcount = typeof args.headcount === "number" ? String(args.headcount) : "";
  const fundingTotal = (args.funding_total as string | undefined) ?? "";
  const emails = Array.isArray(args.emails)
    ? args.emails.filter((value): value is string => typeof value === "string").join(", ")
    : "";
  const phones = Array.isArray(args.phones)
    ? args.phones.filter((value): value is string => typeof value === "string").join(", ")
    : "";

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
      title={isUpdate ? "Update company" : `Create company: ${name}`}
      variant="purple"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      primaryLabel={isUpdate ? "Update" : "Create"}
      primaryIcon="check"
      doneLabel={isUpdate ? "Updated" : "Created"}
      onApprove={onApprove}
      onDeny={onDeny}
      onAllowlistToggle={onAllowlistToggle}
    >
      {field("Name", name)}
      {field("Domain", domain)}
      {field("Website", website)}
      {field("Industry", industry)}
      {field("About", summary)}
      {field("Size", size)}
      {field("Location", location)}
      {field("Founded", founded)}
      {field("Stage", stage)}
      {field("Headcount", headcount)}
      {field("Funding", fundingTotal)}
      {field("Emails", emails)}
      {field("Phones", phones)}
    </BaseToolCallCard>
  );
}
