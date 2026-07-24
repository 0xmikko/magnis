import { useContext, useEffect, useState, type JSX } from "react";
import type { EntityRendererProps } from "@magnis/host/runtime";
import { formatMessageTime } from "@magnis/host/utils";
import { BaseEntityCard } from "@magnis/host/base";
import { ActionPrefix } from "@magnis/host/base";
import { ExpansionContext } from "@magnis/host/agent";

/**
 * SINGLE canonical email card. Per `docs/frontend/module-standard.md`
 * ("ONE COMPONENT PER ENTITY"): the only renderer for `email.message`.
 *
 * Reads `expanded` from `ExpansionContext`:
 *   - `expanded === false` (default): compact form — sender +
 *     subject + time + preview. Same layout used by inbox lists
 *     and Context-panel cards before chevron click.
 *   - `expanded === true`: full form — adds From/To/Attached rows
 *     and the full body. Same component, just different layout.
 *
 * Surfaces (`ExpandableEntityCard`, inbox, detail) never instantiate
 * a different component. They flip `expanded` via context.
 */

// ── Field extractors ─────────────────────────────────────────────

function toStringList(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function bodyText(data: Readonly<Record<string, unknown>>): string | undefined {
  if (typeof data.body_text === "string" && data.body_text.length > 0) return data.body_text;
  if (typeof data.body === "string" && data.body.length > 0) return data.body;
  return undefined;
}

function senderOf(data: Readonly<Record<string, unknown>>): string | undefined {
  if (typeof data.sender === "string" && data.sender.length > 0) return data.sender;
  if (typeof data.from_address === "string" && data.from_address.length > 0) return data.from_address;
  if (typeof data.from === "string" && data.from.length > 0) return data.from;
  return undefined;
}

function recipients(data: Readonly<Record<string, unknown>>): string[] {
  const single = typeof data.to === "string" && data.to.length > 0 ? [data.to] : [];
  return Array.from(new Set([
    ...single,
    ...toStringList(data.to_addresses),
    ...toStringList(data.recipients),
  ]));
}

function attachments(data: Readonly<Record<string, unknown>>): string[] {
  const raw = data.attachments;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.length > 0) out.push(item);
    else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      if (typeof rec.filename === "string" && rec.filename.length > 0) out.push(rec.filename);
      else if (typeof rec.name === "string" && rec.name.length > 0) out.push(rec.name);
    }
  }
  return out;
}

function timestampOf(data: Readonly<Record<string, unknown>>): string | undefined {
  if (typeof data.timestamp === "string" && data.timestamp.length > 0) return data.timestamp;
  if (typeof data.sent_at === "string" && data.sent_at.length > 0) return data.sent_at;
  if (typeof data.received_at === "string" && data.received_at.length > 0) return data.received_at;
  return undefined;
}

/** Normalize `email.get` / inbox-list / tool-result payloads into a
 *  flat record the extractors read. Inline so the card stays
 *  self-sufficient regardless of which surface fed it. */
function flatten(row: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const flat: Record<string, unknown> = { ...row };

  const meta = row.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    Object.assign(flat, meta as Record<string, unknown>);
  }

  const facets = row.facets;
  if (Array.isArray(facets)) {
    for (const f of facets) {
      if (f && typeof f === "object") {
        const facet = f as Record<string, unknown>;
        if (facet.schema_id === "email.message.details" || facet.schema_id === "email.message") {
          const fd = facet.data;
          if (fd && typeof fd === "object" && !Array.isArray(fd)) {
            Object.assign(flat, fd as Record<string, unknown>);
          }
        }
      }
    }
  }

  const linked = row.linked_entities;
  if (
    (flat.to === null || flat.to === undefined) &&
    (flat.to_addresses === null || flat.to_addresses === undefined) &&
    Array.isArray(linked)
  ) {
    const recipient = (linked as Record<string, unknown>[]).find(
      (e) => e.link_kind === "sent_to" && e.schema_id === "email.address",
    );
    if (recipient && typeof recipient.name === "string") {
      flat.to = recipient.name;
    }
  }

  return flat;
}

// ── Chevron gate ─────────────────────────────────────────────────

/** True when the expanded layout would carry information beyond the
 *  compact view (i.e. body, recipients list, or attachments). Used
 *  by `ExpandableEntityCard` to gate the chevron. */
export function emailHasMore(data: Readonly<Record<string, unknown>>): boolean {
  const flat = flatten(data);
  if (bodyText(flat) !== undefined) return true;
  if (recipients(flat).length > 0) return true;
  if (attachments(flat).length > 0) return true;
  // If we have an id we may be able to fetch the full entity on
  // expand; offer the chevron in that case too.
  return typeof flat.id === "string" && flat.id.length > 0;
}

// ── The card ─────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="w-12 shrink-0 text-content-tertiary">{label}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-content">{value}</span>
    </div>
  );
}

export function EmailCard(props: EntityRendererProps): JSX.Element {
  const { data: raw, runtime, action } = props;
  const { expanded } = useContext(ExpansionContext);

  const initial = flatten(raw);
  const [enriched, setEnriched] = useState<Readonly<Record<string, unknown>> | null>(null);
  const data: Readonly<Record<string, unknown>> = enriched
    ? { ...enriched, ...initial }
    : initial;

  // Lazy-fetch the full entity when expanded and the caller's payload
  // lacks body / recipients. Fetch only on expand so the compact view
  // stays cheap.
  useEffect(() => {
    if (!expanded) return;
    if (bodyText(initial) !== undefined && recipients(initial).length > 0) return;
    const id = typeof initial.id === "string" ? initial.id : null;
    if (!id) return;
    let cancelled = false;
    runtime.transport
      .rpc<Record<string, unknown>>("email.get", { id })
      .then((row) => {
        if (!cancelled) setEnriched(flatten(row));
      })
      .catch(() => { /* keep what we have if fetch fails */ });
    return (): void => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, raw, runtime]);

  const subject =
    (typeof data.subject === "string" && data.subject.length > 0 ? data.subject : undefined) ??
    (typeof data.name === "string" && data.name.length > 0 ? data.name : undefined);
  const sender = senderOf(data);
  const to = recipients(data);
  const time = timestampOf(data);
  const timeStr = time ? formatMessageTime(time) : "";
  const preview = typeof data.preview === "string" ? data.preview : undefined;
  const text = bodyText(data);
  const files = attachments(data);

  return (
    <BaseEntityCard {...props}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12px] font-medium text-content">
            <ActionPrefix action={action} />
            {subject ?? "(no subject)"}
          </span>
          {timeStr && (
            <span className="shrink-0 text-[11px] text-content-tertiary">{timeStr}</span>
          )}
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          {sender && (
            <span className="shrink-0 text-[11px] text-content-tertiary">{sender}</span>
          )}
          {!expanded && preview && (
            <span className="line-clamp-1 text-[11px] text-content-tertiary">
              — {preview}
            </span>
          )}
        </div>
        {expanded && (
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="flex flex-col gap-0.5">
              {to.length > 0 && <Row label="To" value={to.join(", ")} />}
              {files.length > 0 && <Row label="Attached" value={files.join(", ")} />}
            </div>
            {text && (
              <div className="whitespace-pre-wrap break-words text-[11px] text-content">
                {text}
              </div>
            )}
          </div>
        )}
      </div>
    </BaseEntityCard>
  );
}
