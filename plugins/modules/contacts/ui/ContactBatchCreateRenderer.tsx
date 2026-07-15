/**
 * ContactBatchCreateRenderer — carousel approval card for contacts.batch_create.
 *
 * Same UX pattern as EmailBatchSendRenderer: read-only by default,
 * Edit button for per-contact editing, Exclude toggle, Deny/Create buttons.
 */

import { useCallback, useMemo, useState } from "react";
import type { JSX } from "react";
import { Icon } from "@magnis/host/ui";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";
import { AllowlistDropdown } from "@magnis/host/agent";

interface BatchContact {
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly company?: string;
  readonly role?: string;
}

interface EditDraft {
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
}

export function ContactBatchCreateRenderer({
  payload,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const contacts = useMemo(() => (args.contacts as readonly BatchContact[]) ?? [], [args.contacts]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());
  const [savedEdits, setSavedEdits] = useState<Map<number, EditDraft>>(() => new Map());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: "", email: "", phone: "", company: "", role: "" });

  const total = contacts.length;
  const activeCount = total - excluded.size;
  const current = contacts[currentIndex];
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
    const existing = savedEdits.get(currentIndex);
    setEditDraft({
      name: existing?.name ?? current.name,
      email: existing?.email ?? current.email ?? "",
      phone: existing?.phone ?? current.phone ?? "",
      company: existing?.company ?? current.company ?? "",
      role: existing?.role ?? current.role ?? "",
    });
    setEditingIndex(currentIndex);
  }, [current, currentIndex, savedEdits]);

  const saveEdit = useCallback((): void => {
    if (editingIndex == null) return;
    setSavedEdits((prev) => {
      const next = new Map(prev);
      next.set(editingIndex, { ...editDraft });
      return next;
    });
    setEditingIndex(null);
  }, [editingIndex, editDraft]);

  const revertEdit = useCallback((): void => { setEditingIndex(null); }, []);

  const buildOverrideArgs = useCallback((): Record<string, unknown> => {
    const updatedContacts = contacts.map((c, i) => {
      const edits = savedEdits.get(i);
      if (!edits) return c;
      const result: Record<string, string> = { name: edits.name };
      if (edits.email) result.email = edits.email;
      if (edits.phone) result.phone = edits.phone;
      if (edits.company) result.company = edits.company;
      if (edits.role) result.role = edits.role;
      return result;
    });
    return { contacts: updatedContacts, excluded_indices: Array.from(excluded) };
  }, [contacts, savedEdits, excluded]);

  const handleApprove = useCallback(async (): Promise<void> => {
    await onApprove(buildOverrideArgs());
  }, [onApprove, buildOverrideArgs]);

  if (!current) {
    return <div className="text-agent-text-muted text-[12px]">No contacts in batch</div>;
  }

  const saved = savedEdits.get(currentIndex);
  const d = {
    name: isEditing ? editDraft.name : (saved?.name ?? current.name),
    email: isEditing ? editDraft.email : (saved?.email ?? current.email ?? ""),
    phone: isEditing ? editDraft.phone : (saved?.phone ?? current.phone ?? ""),
    company: isEditing ? editDraft.company : (saved?.company ?? current.company ?? ""),
    role: isEditing ? editDraft.role : (saved?.role ?? current.role ?? ""),
  };
  const hasEdits = saved != null;

  const headerNav = (
    <div className="flex items-center gap-1">
      <button type="button" className="rounded p-0.5 text-agent-text-muted hover:text-agent-text disabled:opacity-30" disabled={currentIndex === 0 || isEditing} onClick={goLeft}>
        <Icon name="chevron-left" size={14} />
      </button>
      <span className="text-[11px] tabular-nums text-agent-text-muted">{String(currentIndex + 1)}/{String(total)}</span>
      <button type="button" className="rounded p-0.5 text-agent-text-muted hover:text-agent-text disabled:opacity-30" disabled={currentIndex === total - 1 || isEditing} onClick={goRight}>
        <Icon name="chevron-right" size={14} />
      </button>
    </div>
  );

  const field = (label: string, value: string, key: keyof EditDraft): JSX.Element => (
    <div className="mb-1 flex items-baseline gap-1 text-[11px]">
      <span className="shrink-0 w-16 text-[var(--color-agent-tool-purple-text)]">{label}:</span>
      {isEditing ? (
        <input
          type="text"
          className="min-w-0 flex-1 rounded border border-agent-border bg-transparent px-1 py-0.5 text-[11px] text-agent-text outline-none focus:border-[var(--color-agent-tool-purple-primary)]"
          value={value}
          onChange={(e): void => { setEditDraft((prev) => ({ ...prev, [key]: e.target.value })); }}
        />
      ) : (
        <span className="inline-block rounded border border-transparent px-1 py-0.5 text-agent-text">
          {value || <span className="text-agent-text-muted italic">—</span>}
        </span>
      )}
    </div>
  );

  const customActionBar = isDraft ? (
    isEditing ? (
      <div className="flex items-center justify-end gap-2">
        <button type="button" className="rounded-md border border-agent-border px-3 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text" onClick={revertEdit}>Revert</button>
        <button type="button" className="rounded-md bg-[var(--color-agent-tool-purple-primary)] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[var(--color-agent-tool-purple-primary-hover)]" onClick={saveEdit}>Save</button>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <AllowlistDropdown isAllowlisted={isAllowlisted} onToggle={onAllowlistToggle} />
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-agent-text-muted">
          <input type="checkbox" className="accent-[var(--color-agent-tool-purple-primary)]" checked={isExcluded} onChange={(): void => { toggleExclude(currentIndex); }} />
          Exclude
        </label>
        <div className="flex-1" />
        {!isExcluded && (
          <button type="button" className="flex items-center gap-1 rounded-md border border-agent-border px-2.5 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text" onClick={startEdit}>
            <Icon name="edit" size={12} />Edit
          </button>
        )}
        <button type="button" className="rounded-md border border-agent-border px-2.5 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text" onClick={(): void => { void onDeny(); }}>Deny</button>
        <button type="button" className="flex items-center gap-1 rounded-md bg-[var(--color-agent-tool-purple-primary)] hover:bg-[var(--color-agent-tool-purple-primary-hover)] px-3 py-1.5 text-[12px] font-medium text-white" onClick={(): void => { void handleApprove(); }}>
          <Icon name="users" size={12} />
          {`Create ${String(activeCount)} contact${activeCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    )
  ) : undefined;

  return (
    <BaseToolCallCard
      icon="users"
      title={`Batch create (${String(activeCount)} of ${String(total)})`}
      variant="purple"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      headerExtra={headerNav}
      primaryLabel={`Create ${String(activeCount)} contact${activeCount !== 1 ? "s" : ""}`}
      primaryIcon="users"
      doneLabel={`${String(activeCount)} created`}
      onApprove={handleApprove}
      onDeny={onDeny}
      onAllowlistToggle={onAllowlistToggle}
      customActions={customActionBar}
    >
      <div className={isExcluded && !isEditing ? "opacity-40" : ""}>
        {hasEdits && !isEditing && <span className="mb-1 inline-block text-[10px] text-[var(--color-agent-tool-amber-text)]">(edited)</span>}
        {field("Name", d.name, "name")}
        {field("Email", d.email, "email")}
        {field("Phone", d.phone, "phone")}
        {field("Company", d.company, "company")}
        {field("Role", d.role, "role")}
      </div>
    </BaseToolCallCard>
  );
}
