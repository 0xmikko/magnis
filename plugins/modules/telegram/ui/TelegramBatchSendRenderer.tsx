/**
 * TelegramBatchSendRenderer — carousel approval card for telegram.batch_send.
 *
 * One recipient at a time with ←/→ paging (N/M), per-message Edit, and Exclude —
 * mirrors plugins/email/ui/EmailBatchSendRenderer.tsx so a multi-recipient
 * outreach is reviewed (and individually corrected) in ONE approval pause, rather
 * than dumped as one long uneditable scroll. Telegram messages have no subject, so
 * Edit is text-only. On approve the override carries edited text + excluded_indices
 * (the service skips excluded recipients).
 *
 * NOTE (drift): plugin UI files cannot deep-import frontend/src; colocated with
 * the plugin (mirrors email's renderer), registered from plugins/telegram/ui/index.tsx.
 */

import { useCallback, useMemo, useState } from "react";
import type { JSX } from "react";
import { Icon } from "@magnis/host/ui";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";
import { AllowlistDropdown } from "@magnis/host/agent";

interface BatchMessage {
  readonly chat_id: number | string;
  readonly text: string;
  readonly reply_to_message_id?: number;
  readonly chat_name?: string;
}

export function TelegramBatchSendRenderer({
  payload,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args as Record<string, unknown>;
  const messages = useMemo(() => (args.messages as readonly BatchMessage[]) ?? [], [args.messages]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());
  const [savedEdits, setSavedEdits] = useState<Map<number, string>>(() => new Map());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const total = messages.length;
  const activeCount = total - excluded.size;
  const current = messages[currentIndex];
  const isEditing = editingIndex === currentIndex;
  const isDraft = tc.status === "pending";
  const isExcluded = excluded.has(currentIndex);

  const goLeft = useCallback((): void => { setCurrentIndex((i) => Math.max(0, i - 1)); }, []);
  const goRight = useCallback((): void => { setCurrentIndex((i) => Math.min(total - 1, i + 1)); }, [total]);

  const toggleExclude = useCallback((idx: number): void => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) { next.delete(idx); } else { next.add(idx); }
      return next;
    });
  }, []);

  const startEdit = useCallback((): void => {
    if (!current) return;
    setEditText(savedEdits.get(currentIndex) ?? current.text);
    setEditingIndex(currentIndex);
  }, [current, currentIndex, savedEdits]);

  const saveEdit = useCallback((): void => {
    if (editingIndex == null) return;
    setSavedEdits((prev) => {
      const next = new Map(prev);
      next.set(editingIndex, editText);
      return next;
    });
    setEditingIndex(null);
  }, [editingIndex, editText]);

  const revertEdit = useCallback((): void => { setEditingIndex(null); }, []);

  const buildOverrideArgs = useCallback((): Record<string, unknown> => {
    const updatedMessages = messages.map((msg, i) => ({ ...msg, text: savedEdits.get(i) ?? msg.text }));
    return { messages: updatedMessages, excluded_indices: Array.from(excluded) };
  }, [messages, savedEdits, excluded]);

  const handleApprove = useCallback(async (): Promise<void> => {
    await onApprove(buildOverrideArgs());
  }, [onApprove, buildOverrideArgs]);

  if (!current) {
    return <div className="text-agent-text-muted text-[12px]">No messages in batch</div>;
  }

  const saved = savedEdits.get(currentIndex);
  const displayText = isEditing ? editText : (saved ?? current.text);
  const hasEdits = saved != null;
  const toLabel = current.chat_name && current.chat_name.length > 0 ? current.chat_name : String(current.chat_id);

  const headerNav = (
    <div className="flex items-center gap-1" data-testid="telegram-batch-nav">
      <button type="button" className="rounded p-0.5 text-agent-text-muted hover:text-agent-text disabled:opacity-30" disabled={currentIndex === 0 || isEditing} onClick={goLeft}>
        <Icon name="chevron-left" size={14} />
      </button>
      <span className="text-[11px] tabular-nums text-agent-text-muted">{String(currentIndex + 1)}/{String(total)}</span>
      <button type="button" className="rounded p-0.5 text-agent-text-muted hover:text-agent-text disabled:opacity-30" disabled={currentIndex === total - 1 || isEditing} onClick={goRight}>
        <Icon name="chevron-right" size={14} />
      </button>
    </div>
  );

  const customActionBar = isDraft ? (
    isEditing ? (
      <div className="flex items-center justify-end gap-2">
        <button type="button" className="rounded-md border border-agent-border px-3 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text" onClick={revertEdit}>
          Revert
        </button>
        <button type="button" className="rounded-md bg-sky-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-sky-400" onClick={saveEdit}>
          Save
        </button>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <AllowlistDropdown isAllowlisted={isAllowlisted} onToggle={onAllowlistToggle} />
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-agent-text-muted">
          <input type="checkbox" className="accent-sky-500" checked={isExcluded} onChange={(): void => { toggleExclude(currentIndex); }} />
          Exclude
        </label>
        <div className="flex-1" />
        {!isExcluded && (
          <button type="button" className="flex items-center gap-1 rounded-md border border-agent-border px-2.5 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text" onClick={startEdit}>
            <Icon name="edit" size={12} />
            Edit
          </button>
        )}
        <button type="button" className="rounded-md border border-agent-border px-2.5 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text" onClick={(): void => { void onDeny(); }}>
          Deny
        </button>
        <button type="button" className="flex items-center gap-1 rounded-md bg-sky-500 hover:bg-sky-400 px-3 py-1.5 text-[12px] font-medium text-white" onClick={(): void => { void handleApprove(); }}>
          <Icon name="send" size={12} />
          {`Send ${String(activeCount)} message${activeCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    )
  ) : undefined;

  return (
    <BaseToolCallCard
      icon="send"
      title={`Telegram batch (${String(activeCount)} of ${String(total)})`}
      variant="sky"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      headerExtra={headerNav}
      primaryLabel={`Send ${String(activeCount)} message${activeCount !== 1 ? "s" : ""}`}
      primaryIcon="send"
      doneLabel={`${String(activeCount)} sent`}
      onApprove={handleApprove}
      onDeny={onDeny}
      onAllowlistToggle={onAllowlistToggle}
      customActions={customActionBar}
    >
      <div className={isExcluded && !isEditing ? "opacity-40" : ""}>
        <div className="mb-1 text-[11px]">
          <span className="text-sky-400/80">To:</span>{" "}
          <span className="text-agent-text" data-testid="batch-recipient">{toLabel}</span>
          {hasEdits && !isEditing && <span className="ml-2 text-[10px] text-amber-400">(edited)</span>}
        </div>
        {isEditing ? (
          <textarea
            className="mb-2 w-full resize-none rounded border border-agent-border bg-transparent px-2 py-1 text-[13px] leading-[1.5] text-agent-text outline-none focus:border-sky-400"
            style={{ fieldSizing: "content" }}
            rows={1}
            value={editText}
            onChange={(e): void => { setEditText(e.target.value); }}
          />
        ) : (
          <p className="mb-2 whitespace-pre-wrap rounded border border-transparent px-2 py-1 text-[13px] leading-[1.5] text-agent-text">{displayText}</p>
        )}
      </div>
    </BaseToolCallCard>
  );
}
