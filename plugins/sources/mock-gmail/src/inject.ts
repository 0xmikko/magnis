// HTTP injection payload builders (demo / eval parity) — ported 1:1 from the
// Rust `inject_email` / `inject_event` handlers. Pure: they shape the canonical
// payload + remote_id; the caller appends to the shared file.

import { randomUUID } from "node:crypto";
import { appendItem } from "./store";

type Json = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Rust: `req.get(k).cloned().unwrap_or(Value::Null)` — absent ⇒ JSON null. */
function orNull(v: unknown): unknown {
  return v === undefined ? null : v;
}

export function buildEmail(req: Json): { payload: Json; remoteId: string } {
  const messageId = str(req.message_id) ?? `mock-${randomUUID()}`;
  const rawAttachments = Array.isArray(req.attachments) ? (req.attachments as Json[]) : [];
  const attachments = rawAttachments.map((a) => ({
    attachment_id: str(a?.attachment_id) ?? `att-${randomUUID()}`,
    filename: orNull(a?.filename),
    mime_type: orNull(a?.mime_type),
    size: a?.size === undefined ? 0 : a.size,
  }));
  const payload: Json = {
    message_id: messageId,
    from_address: orNull(req.from_address),
    // Rust: `and_then(as_str).unwrap_or_default()` ⇒ "" when absent/non-string.
    from_name: str(req.from_name) ?? "",
    subject: orNull(req.subject),
    body_text: orNull(req.body_text),
    sent_at: new Date().toISOString(),
    has_attachments: attachments.length > 0,
    attachments,
  };
  const threadId = str(req.thread_id);
  if (threadId !== undefined) payload.thread_id = threadId;
  return { payload, remoteId: messageId };
}

export function buildEvent(req: Json): { payload: Json; remoteId: string } {
  const id = str(req.id) ?? `mock-${randomUUID()}`;
  const rawAttendees = Array.isArray(req.attendees) ? (req.attendees as Json[]) : [];
  const attendees = rawAttendees.map((a) => ({
    name: orNull(a?.name),
    email: orNull(a?.email),
  }));
  const payload: Json = {
    id,
    title: orNull(req.title),
    starts_at: orNull(req.starts_at),
    ends_at: orNull(req.ends_at),
    attendees,
  };
  const description = str(req.description);
  if (description !== undefined) payload.description = description;
  const location = str(req.location);
  if (location !== undefined) payload.location = location;
  return { payload, remoteId: `gcal:${id}` };
}

/** Rust: `append_item(..).unwrap_or(0)` — an IO failure still answers queued. */
function appendOrZero(surface: string, payload: Json, remoteId: string): number {
  try {
    return appendItem(surface, payload, remoteId);
  } catch {
    return 0;
  }
}

export function injectEmail(req: Json): Json {
  const { payload, remoteId } = buildEmail(req);
  return { queued: true, total: appendOrZero("email", payload, remoteId) };
}

export function injectEvent(req: Json): Json {
  const { payload, remoteId } = buildEvent(req);
  return { queued: true, total: appendOrZero("meetings", payload, remoteId) };
}
