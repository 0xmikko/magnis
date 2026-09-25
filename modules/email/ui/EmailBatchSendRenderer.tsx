/**
 * EmailBatchSendRenderer — carousel approval card for email.batch_send.
 *
 * Read-only by default. "Edit" button in the action bar enters edit mode.
 * In edit mode the entire action bar is replaced with Revert/Save.
 */

import { useCallback, useMemo, useState } from "react";
import type { JSX } from "react";
import { Icon } from "@magnis/host/ui";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";
import { AllowlistDropdown } from "@magnis/host/agent";

interface BatchMessage {
  readonly to: string;
  readonly subject: string;
  readonly body_text: string;
  readonly attachment_ids?: readonly string[];
}

interface EditDraft {
  subject: string;
  body_text: string;
}

export function EmailBatchSendRenderer({
  payload,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args as Record<string, unknown>;
  const messages = useMemo(() => (args.messages as readonly BatchMessage[] | undefined) ?? [], [args.messages]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());
  const [savedEdits, setSavedEdits] = useState<Map<number, EditDraft>>(() => new Map());
  const [expanded, setExpanded] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({ subject: "", body_text: "" });

  const total = messages.length;
  const activeCount = total - excluded.size;
  const current = messages.at(currentIndex);
  const isEditing = editingIndex === currentIndex;
  const isDraft = tc.status === "pending";
  const isExcluded = excluded.has(currentIndex);

  // Navigation
  const goLeft = useCallback((): void => { setCurrentIndex((i) => Math.max(0, i - 1)); }, []);
  const goRight = useCallback((): void => { setCurrentIndex((i) => Math.min(total - 1, i + 1)); }, [total]);

  // Exclude toggle
  const toggleExclude = useCallback((idx: number): void => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) { next.delete(idx); } else { next.add(idx); }
      return next;
    });
  }, []);

  // Edit mode
  const startEdit = useCallback((): void => {
    if (!current) return;
    const existing = savedEdits.get(currentIndex);
    setEditDraft({
      subject: existing?.subject ?? current.subject,
      body_text: existing?.body_text ?? current.body_text,
    });
    setEditingIndex(currentIndex);
  }, [current, currentIndex, savedEdits]);

  const saveEdit = useCallback((): void => {
    if (editingIndex === null) return;
    setSavedEdits((prev) => {
      const next = new Map(prev);
      next.set(editingIndex, { ...editDraft });
      return next;
    });
    setEditingIndex(null);
  }, [editingIndex, editDraft]);

  const revertEdit = useCallback((): void => { setEditingIndex(null); }, []);

  // Build override arguments
  const buildOverrideArgs = useCallback((): Record<string, unknown> => {
    const updatedMessages = messages.map((msg, i) => {
      const edits = savedEdits.get(i);
      return { ...msg, subject: edits?.subject ?? msg.subject, body_text: edits?.body_text ?? msg.body_text };
    });
    return { messages: updatedMessages, excluded_indices: Array.from(excluded) };
  }, [messages, savedEdits, excluded]);

  const handleApprove = useCallback(async (): Promise<void> => {
    await onApprove(buildOverrideArgs());
  }, [onApprove, buildOverrideArgs]);

  if (!current) {
    return <div className="text-agent-text-muted text-[12px]">No messages in batch</div>;
  }

  const saved = savedEdits.get(currentIndex);
  const displaySubject = isEditing ? editDraft.subject : (saved?.subject ?? current.subject);
  const displayBody = isEditing ? editDraft.body_text : (saved?.body_text ?? current.body_text);
  const hasEdits = saved !== undefined;

  // Header navigation
  const headerNav = (
    <div className="flex items-center gap-1">
      <button type="button" className="rounded p-0.5 text-agent-text-muted hover:text-agent-text disabled:opacity-30" disabled={currentIndex === 0 || isEditing} onClick={goLeft}>
        <Icon name="chevron-left" size={14} />
      </button>
      <span className="text-[11px] tabular-nums text-agent-text-muted">{String(currentIndex + 1)}/{String(total)}</span>
      <button type="button" className="rounded p-0.5 text-agent-text-muted hover:text-agent-text disabled:opacity-30" disabled={currentIndex === total - 1 || isEditing} onClick={goRight}>
        <Icon name="chevron-right" size={14} />
      </button>
      <button type="button" className="ml-1 rounded p-0.5 text-agent-text-muted hover:text-agent-text" onClick={(): void => { setExpanded((v) => !v); }} title={expanded ? "Collapse" : "Expand"}>
        <Icon name={expanded ? "minimize-2" : "maximize-2"} size={13} />
      </button>
    </div>
  );

  // Custom action bar — edit mode: Revert/Save; view mode: Exclude + Edit + Send
  const customActionBar = isDraft ? (
    isEditing ? (
      <div className="flex items-center justify-end gap-2">
        <button type="button" className="rounded-md border border-agent-border px-3 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text" onClick={revertEdit}>
          Revert
        </button>
        <button type="button" className="rounded-md bg-rose-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-rose-400" onClick={saveEdit}>
          Save
        </button>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <AllowlistDropdown isAllowlisted={isAllowlisted} onToggle={onAllowlistToggle} />
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-agent-text-muted">
          <input type="checkbox" className="accent-rose-500" checked={isExcluded} onChange={(): void => { toggleExclude(currentIndex); }} />
          Exclude
        </label>
        <div className="flex-1" />
        {!isExcluded && (
          <button type="button" className="flex items-center gap-1 rounded-md border border-agent-border px-2.5 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text" onClick={startEdit}>
            <Icon name="edit" size={12} />
            Edit
          </button>
        )}
        <button
          type="button"
          className="rounded-md border border-agent-border px-2.5 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text"
          onClick={(): void => { void onDeny(); }}
        >
          Deny
        </button>
        <button
          type="button"
          className="flex items-center gap-1 rounded-md bg-rose-500 hover:bg-rose-400 px-3 py-1.5 text-[12px] font-medium text-white"
          onClick={(): void => { void handleApprove(); }}
        >
          <Icon name="send" size={12} />
          {`Send ${String(activeCount)} email${activeCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    )
  ) : undefined;

  return (
    <BaseToolCallCard
      icon="mail"
      title={`Batch send (${String(activeCount)} of ${String(total)})`}
      variant="rose"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      headerExtra={headerNav}
      primaryLabel={`Send ${String(activeCount)} email${activeCount !== 1 ? "s" : ""}`}
      primaryIcon="send"
      doneLabel={`${String(activeCount)} sent`}
      onApprove={handleApprove}
      onDeny={onDeny}
      onAllowlistToggle={onAllowlistToggle}
      customActions={customActionBar}
    >
      {/* ── Current email ── */}
      <div className={isExcluded && !isEditing ? "opacity-40" : ""}>
        <div className="mb-1 text-[11px]">
          <span className="text-rose-400/80">To:</span>{" "}
          <span className="text-agent-text">{current.to}</span>
          {hasEdits && !isEditing && <span className="ml-2 text-[10px] text-amber-400">(edited)</span>}
        </div>

        <div className="mb-1 flex items-baseline gap-1 text-[11px]">
          <span className="shrink-0 text-rose-400/80">Subject:</span>
          {isEditing ? (
            <input type="text" className="min-w-0 flex-1 rounded border border-agent-border bg-transparent px-1 py-0.5 text-[11px] text-agent-text outline-none focus:border-rose-400" value={editDraft.subject} onChange={(e): void => { setEditDraft((d) => ({ ...d, subject: e.target.value })); }} />
          ) : (
            <span className="inline-block rounded border border-transparent px-1 py-0.5 text-agent-text">{displaySubject}</span>
          )}
        </div>

        {isEditing ? (
          <textarea className="mb-2 w-full resize-none rounded border border-agent-border bg-transparent px-2 py-1 text-[13px] leading-[1.5] text-agent-text outline-none focus:border-rose-400" style={{ fieldSizing: "content" }} rows={1} value={editDraft.body_text} onChange={(e): void => { setEditDraft((d) => ({ ...d, body_text: e.target.value })); }} />
        ) : (
          <p className={"mb-2 whitespace-pre-wrap rounded border border-transparent px-2 py-1 text-[13px] leading-[1.5] text-agent-text"}>{displayBody}</p>
        )}

        {current.attachment_ids && current.attachment_ids.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {current.attachment_ids.map((id, i) => (
              <span key={i} className="flex items-center gap-1 rounded bg-surface-secondary px-2 py-0.5 text-[11px] text-agent-text-muted">
                <Icon name="paperclip" size={10} />{id}
              </span>
            ))}
          </div>
        )}
      </div>
    </BaseToolCallCard>
  );
}
