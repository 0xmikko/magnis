import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { BaseToolCallCard } from "@magnis/host/base";
import { useAppRuntime, type AgentRendererProps, type ToolCallRendererPayload } from "@magnis/host/runtime";
import { parseResult } from "./ContactMergeRenderer";
import type { RawEntity } from "@magnis/plugin-sdk";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function outcome(value: unknown): { lines: string[]; failed: boolean } {
  const result = parseResult(value);
  if (typeof result?.error === "string") return { lines: [result.error], failed: true };
  if (typeof result?.complete === "boolean" && Array.isArray(result.issues)) {
    return result.complete ? { lines: ["Migration choices saved. Applying…"], failed: false }
      : { lines: result.issues.map((issue: unknown) => {
        const item = record(issue);
        return typeof item?.message === "string" ? item.message : "Invalid migration issue";
      }), failed: true };
  }
  if (!Array.isArray(result?.results)) return { lines: ["Invalid synchronization result"], failed: true };
  let failed = false;
  const lines = result.results.map((entry: unknown) => {
    const item = record(entry);
    const application = record(item?.application);
    if (typeof item?.identityId !== "string") { failed = true; return "Invalid identity result"; }
    if (item.kind === "failed" && typeof item.message === "string") { failed = true; return `${item.identityId}: Not saved: ${item.message}`; }
    if (item.kind !== "saved" || typeof item.syncEnabled !== "boolean") { failed = true; return `${item.identityId}: Invalid saved choice`; }
    const saved = `${item.identityId}: Saved ${item.syncEnabled ? "On" : "Off"}.`;
    if (application?.kind === "pending") return `${saved} Applying…`;
    failed = true;
    return application?.kind === "failed" && typeof application.message === "string"
      ? `${saved} Could not be applied: ${application.message}` : `${saved} Invalid application result`;
  });
  return { lines: lines.length === 0 ? ["No supported identities linked."] : lines, failed };
}

/** Shared approval and result card for module-owned synchronization choices. */
export function SyncToolCallRenderer({ payload }: Pick<AgentRendererProps<ToolCallRendererPayload>, "payload">): JSX.Element {
  const { toolCall, toolResult, superseded, isAllowlisted, onApprove, onDeny, onAllowlistToggle } = payload;
  const runtime = useAppRuntime();
  const args = record(toolCall.args);
  const migration = toolCall.toolBinding?.operation === "resolveSyncMigration";
  const target = migration ? record(args?.target)?.key : args?.id;
  const enabled = args?.syncEnabled;
  const valid = typeof target === "string" && target.length > 0 && typeof enabled === "boolean";
  const entity = useQuery({
    queryKey: ["entity-properties", target],
    queryFn: () => runtime.transport.rpc<RawEntity | null>("graph.entity.get", { id: target }),
    enabled: valid && !migration,
  });
  const scope = toolCall.toolBinding?.entity === "contacts.person"
    ? "Applies once to currently linked email, X and Telegram identities. Later identities follow their module settings."
    : toolCall.toolBinding?.entity === "email.address" ? "Controls all mail from this exact sender across threads and accounts."
      : toolCall.toolBinding?.entity === "telegram.account" ? "Controls events and history from this identity's existing Telegram direct chat."
        : "Controls incoming events and history acquisition for this identity.";
  const summary = toolResult === undefined ? null : outcome(toolResult.result);
  const failedResult = summary?.failed && toolResult !== undefined
    ? { ...toolResult, result: { error: summary.lines.join("; ") } } : toolResult;
  const action = enabled === true ? "Start" : "Stop";
  const unavailable = !valid || (!migration && (entity.isPending || entity.isError || entity.data === null));

  return <BaseToolCallCard icon="repeat-2" variant="sky"
    title={`${migration ? "Resolve migration: " : ""}${action} synchronization`}
    status={toolCall.status} toolResult={failedResult} superseded={superseded} isAllowlisted={isAllowlisted}
    primaryLabel={action} primaryIcon="check" doneLabel="Saved"
    onApprove={onApprove} onDeny={onDeny} onAllowlistToggle={onAllowlistToggle}
    customActions={unavailable ? <div role="alert">{!valid ? "Invalid synchronization target or choice" : entity.isError ? entity.error.message : entity.data === null ? "Target not found" : "Loading target…"}</div> : undefined}
  >
    <p>{migration ? String(target) : entity.data?.name}</p>
    <p>{scope}</p>
    <p>Stored data remains available. Indexing settings stay unchanged.</p>
    {summary?.lines.map((line, index) => <p key={index} role={summary.failed ? "alert" : "status"}>{line}</p>)}
  </BaseToolCallCard>;
}
