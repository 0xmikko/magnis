/**
 * ContactMergeRenderer — table-style approval card for contacts.merge.
 *
 * Renders a comparison table:
 *   | Field | Contact 1 | Contact 2 | Merged Result |
 * When pending: fetches preview via contacts.merge_preview RPC.
 * When done: shows result summary (no preview fetch — retired entity is deleted).
 */

import { useCallback, useEffect, useState } from "react";
import type { JSX } from "react";
import { Icon } from "@magnis/host/ui";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";

interface MergeField {
  readonly canonical_key: string;
  readonly strategy: string;
  readonly survivor_value: unknown;
  readonly retired_value: unknown;
  readonly auto_resolved: unknown;
}

interface MergePreviewData {
  readonly survivor: { readonly id: string; readonly name: string | null; readonly facet_count: number };
  readonly retired: { readonly id: string; readonly name: string | null; readonly facet_count: number };
  readonly fields: Record<string, MergeField>;
  readonly links_to_repoint: number;
  readonly duplicate_links_to_remove: number;
}

interface MergeResult {
  readonly survivor_id: string;
  readonly retired_id: string;
  readonly facets_moved: number;
  readonly links_repointed: number;
  readonly links_deduplicated: number;
}

function fmtVal(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(fmtVal).join(", ");
  return JSON.stringify(value);
}

function fieldLabel(key: string): string {
  const parts = key.split(".");
  const last = parts[parts.length - 1] ?? key;
  return last.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractPreview(raw: unknown): MergePreviewData | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const candidate = (obj.preview ?? obj) as Record<string, unknown>;
  if ("survivor" in candidate && "retired" in candidate && "fields" in candidate) {
    return candidate as unknown as MergePreviewData;
  }
  return null;
}

function extractMergeResult(raw: unknown): MergeResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const candidate = (obj.result ?? obj) as Record<string, unknown>;
  if ("survivor_id" in candidate && "facets_moved" in candidate) {
    return candidate as unknown as MergeResult;
  }
  return null;
}

function MergeTable({ preview }: { readonly preview: MergePreviewData }): JSX.Element {
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
        const sv = fmtVal(field.survivor_value);
        const rv = fmtVal(field.retired_value);
        const mr = fmtVal(field.auto_resolved);
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
            <div className="flex items-center border-l border-agent-border/30 bg-[var(--color-agent-tool-teal-soft-bg)] px-2 py-1.5">
              <span className="text-[11px] font-medium text-[var(--color-agent-tool-teal-text)]">{mr}</span>
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
  const survivorId = args.survivor_id as string | undefined;
  const retiredId = args.retired_id as string | undefined;
  const reason = args.reason as string | undefined;

  const [preview, setPreview] = useState<MergePreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDone = tc.status === "approved" && toolResult != null;

  // Fetch preview only when NOT done (retired entity is deleted after merge)
  useEffect(() => {
    if (!survivorId || !retiredId || preview || isDone) return;
    setLoading(true);
    runtime.transport
      .rpc("contacts.merge_preview", { survivor_id: survivorId, retired_id: retiredId })
      .then((result: unknown) => { setPreview(extractPreview(result)); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { setLoading(false); });
  }, [survivorId, retiredId, preview, isDone, runtime.transport]);

  const handleApprove = useCallback(async (): Promise<void> => {
    await onApprove();
  }, [onApprove]);

  const mergeResult: MergeResult | null = isDone
    ? ((): MergeResult | null => {
        const raw = toolResult.result;
        if (!raw) return null;
        const parsed = typeof raw === "string"
          ? ((): unknown => { try { return JSON.parse(raw) as unknown; } catch { return null; } })()
          : raw;
        return extractMergeResult(parsed);
      })()
    : null;

  const fieldCount = preview ? Object.keys(preview.fields).length : 0;
  const doneLabel = mergeResult
    ? `Merged (${String(mergeResult.facets_moved)} facets, ${String(mergeResult.links_repointed)} links)`
    : "Merged";

  return (
    <BaseToolCallCard
      icon="users"
      title="Merge contacts"
      variant="teal"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      primaryLabel="Confirm Merge"
      primaryIcon="users"
      doneLabel={doneLabel}
      onApprove={handleApprove}
      onDeny={onDeny}
      onAllowlistToggle={onAllowlistToggle}
    >
      {loading && (
        <div className="flex items-center gap-2 text-[11px] text-agent-text-muted">
          <Icon name="loader" size={12} className="animate-spin" />
          Loading preview…
        </div>
      )}

      {error && <div className="text-[11px] text-red-400">Preview error: {error}</div>}

      {preview && !isDone && (
        <div className="space-y-2">
          {reason && <div className="text-[11px] text-agent-text-muted italic">{reason}</div>}
          <MergeTable preview={preview} />
          <div className="flex gap-3 text-[10px] text-agent-text-muted">
            <span>{String(fieldCount)} fields resolved</span>
            <span>{String(preview.links_to_repoint)} links to transfer</span>
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
            {String(mergeResult.facets_moved)} facets transferred, {String(mergeResult.links_repointed)} links repointed
            {mergeResult.links_deduplicated > 0 && `, ${String(mergeResult.links_deduplicated)} deduplicated`}
          </div>
        </div>
      )}
    </BaseToolCallCard>
  );
}
