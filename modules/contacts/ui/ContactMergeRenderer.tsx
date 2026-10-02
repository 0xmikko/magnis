/**
 * ContactMergeRenderer — table-style approval card for contacts.merge.
 *
 * Renders a comparison table:
 *   | Field | Contact 1 | Contact 2 | Merged Result |
 * When pending: fetches preview via contacts.merge_preview RPC.
 * When done: shows result summary (no preview fetch — retired entity is deleted).
 */

import type { MergePreview, MergeResult } from "@magnis/sdk";
import { useCallback, useEffect, useState } from "react";
import type { JSX } from "react";
import { Icon } from "@magnis/host/ui";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";

function fmtVal(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(fmtVal).join(", ");
  return JSON.stringify(value);
}

function fieldLabel(key: string): string {
  const parts = key.split(".");
  const last = parts[parts.length - 1] ?? key;
  return last.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseResult(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    try { return parseResult(JSON.parse(raw)); } catch { return null; }
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  if ("content" in raw && Array.isArray(raw.content)) {
    const first: unknown = raw.content[0];
    if (first !== null && typeof first === "object" && "text" in first && typeof first.text === "string") {
      return parseResult(first.text);
    }
  }
  return { ...raw };
}

export function extractPreview(raw: unknown): MergePreview | null {
  const obj = parseResult(raw);
  if (obj === null) return null;
  const candidate = (obj.preview ?? obj) as Record<string, unknown>;
  if ("survivor" in candidate && "retired" in candidate && "fields" in candidate) {
    return candidate as unknown as MergePreview;
  }
  return null;
}

function extractMergeResult(raw: unknown): MergeResult | null {
  const obj = parseResult(raw);
  if (obj === null) return null;
  const candidate = (obj.result ?? obj) as Record<string, unknown>;
  if ("survivorId" in candidate && "linksRepointed" in candidate) {
    return candidate as unknown as MergeResult;
  }
  return null;
}

export function MergeTable({ preview }: { readonly preview: MergePreview }): JSX.Element {
  const fields = Object.entries(preview.fields);

  return (
    <div className="overflow-hidden rounded-md border border-agent-border/60">
      {/* Column headers — neutral names, NOT entity names */}
      <div className="grid grid-cols-[100px_1fr_1fr_1fr] border-b border-agent-border/40">
        <div className="px-2 py-1.5" />
        <div className="border-l border-agent-border/30 px-2 py-1.5 text-center">
          <span className="text-[10px] font-semibold text-[var(--color-agent-tool-purple-text)]">Contact 1</span>
        </div>
        <div className="border-l border-agent-border/30 px-2 py-1.5 text-center">
          <span className="text-[10px] font-semibold text-[var(--color-agent-tool-amber-text)]">Contact 2</span>
        </div>
        <div className="border-l border-agent-border/30 px-2 py-1.5 text-center">
          <span className="text-[10px] font-semibold text-[var(--color-agent-tool-teal-text)]">Merged Result</span>
        </div>
      </div>

      {/* Field rows */}
      {fields.map(([key, field], rowIdx) => {
        const sv = fmtVal(field.survivorValue);
        const rv = fmtVal(field.retiredValue);
        const conflicted = field.conflict;
        const mr = conflicted ? "needs your answer" : fmtVal(field.autoResolved);
        const borderClass = rowIdx < fields.length - 1 ? "border-b border-agent-border/20" : "";

        return (
          <div key={key} className={`grid grid-cols-[100px_1fr_1fr_1fr] ${borderClass}`}>
            <div className="flex items-center px-2 py-1.5">
              <span className="text-[11px] text-agent-text-muted">{fieldLabel(key)}</span>
            </div>
            <div className="flex items-center border-l border-agent-border/30 px-2 py-1.5">
              <span className="text-[11px] text-agent-text">{sv}</span>
            </div>
            <div className="flex items-center border-l border-agent-border/30 px-2 py-1.5">
              <span className="text-[11px] text-agent-text">{rv}</span>
            </div>
            <div
              className={`flex items-center border-l border-agent-border/30 px-2 py-1.5 ${
                conflicted ? "" : "bg-[var(--color-agent-tool-teal-soft-bg)]"
              }`}
            >
              <span
                className={`text-[11px] font-medium ${
                  conflicted ? "text-amber-400" : "text-[var(--color-agent-tool-teal-text)]"
                }`}
              >
                {mr}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ContactMergeRenderer({
  payload,
  runtime,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args as Record<string, unknown>;
  const survivorId = args.survivorId as string | undefined;
  const retiredId = args.retiredId as string | undefined;
  const reason = args.reason as string | undefined;
  const isPreview = args.preview === true;

  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDone = tc.status === "approved" && toolResult !== undefined;

  // Fetch preview only when NOT done (retired entity is deleted after merge)
  useEffect(() => {
    if (isPreview || !survivorId || !retiredId || preview || isDone) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the spinner before the async merge-preview fetch below; the resolve/reject set state asynchronously.
    setLoading(true);
    runtime.transport
      .rpc("contacts.merge_preview", { survivorId, retiredId })
      .then((result: unknown) => { setPreview(extractPreview(result)); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { setLoading(false); });
  }, [survivorId, retiredId, preview, isDone, isPreview, runtime.transport]);

  const handleApprove = useCallback(async (): Promise<void> => {
    await onApprove();
  }, [onApprove]);

  const completedResult = isDone ? toolResult.result : null;
  const mergeResult = isPreview ? null : extractMergeResult(completedResult);
  const visiblePreview = isPreview ? extractPreview(completedResult) : preview;
  const fieldCount = visiblePreview ? Object.keys(visiblePreview.fields).length : 0;
  const conflictCount = visiblePreview
    ? Object.values(visiblePreview.fields).filter((field) => field.conflict).length : 0;
  const doneLabel = isPreview ? "Preview" : mergeResult
    ? `Merged (${String(mergeResult.linksRepointed)} links)` : "Merged";

  return (
    <BaseToolCallCard
      icon="users"
      title={isPreview ? "Preview contact merge" : "Merge contacts"}
      variant="teal"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      primaryLabel={isPreview ? "Preview" : "Confirm Merge"}
      customActions={isPreview ? <></> : undefined}
      primaryIcon="users"
      doneLabel={doneLabel}
      onApprove={handleApprove}
      onDeny={onDeny}
      onAllowlistToggle={isPreview ? undefined : onAllowlistToggle}
    >
      {loading && (
        <div className="flex items-center gap-2 text-[11px] text-agent-text-muted">
          <Icon name="loader" size={12} className="animate-spin" />
          Loading preview…
        </div>
      )}

      {error && <div className="text-[11px] text-red-400">Preview error: {error}</div>}

      {visiblePreview && (isPreview || !isDone) && (
        <div className="space-y-2">
          {reason && <div className="text-[11px] text-agent-text-muted italic">{reason}</div>}
          <MergeTable preview={visiblePreview} />
          <div className="flex gap-3 text-[10px] text-agent-text-muted">
            <span>{String(fieldCount - conflictCount)} fields resolved</span>
            {conflictCount > 0 && (
              <span className="text-amber-400">
                {String(conflictCount)} need an answer — the merge will refuse until then
              </span>
            )}
            <span>{String(visiblePreview.linksToRepoint)} links to transfer</span>
          </div>
        </div>
      )}

      {isDone && mergeResult && (
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center gap-1.5 text-[var(--color-agent-tool-teal-text)]">
            <Icon name="circle-check" size={14} />
            <span>Contacts merged successfully</span>
          </div>
          <div className="text-agent-text-muted">
            {String(mergeResult.linksRepointed)} links repointed
            {mergeResult.linksDeduplicated > 0 && `, ${String(mergeResult.linksDeduplicated)} deduplicated`}
          </div>
        </div>
      )}
    </BaseToolCallCard>
  );
}

/**
 * `contacts.merge_preview` renders NOTHING on purpose.
 *
 * It is a read tool whose whole payload — the survivor/retired comparison —
 * is already drawn by ContactMergeRenderer, which fetches the preview itself.
 * The agent nevertheless calls it explicitly once per candidate pair, so
 * without a registration each call left a bare "contacts merge preview" row
 * in the transcript: no content, no action, one per pair. Registering silence
 * is the honest fix — the information is not missing, it is shown by the card
 * the preview belongs to.
 */
export function ContactMergePreviewSilent(): null {
  return null;
}
