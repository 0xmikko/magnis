// Email plugin — helpers shared inside module/. Free functions + tuning consts
// extracted from service.ts (the class stays the ONLY declaration there). Pure
// shaping of source `Data` payloads into wire DTOs, mirroring the native module
// (extract_sender / extract_preview / strip_body_html / MessageListItem).

import type { RawEntity } from "@magnis/plugin-sdk";
import type { MessageListItem } from "../types.ts";

export type Data = Record<string, unknown>;

// PGlite is single-connection, so a sync page must be applied in CHUNKS — at
// most this many TOTAL batch entities (messages + their unique addresses) per
// apply_batch — so each transaction is short and other RPCs aren't starved.
export const INGEST_CHUNK = 200;

// Placeholder sender for agent-composed outgoing mail (native parity — the real
// from-address is stamped by the connector when the message actually sends).
export const OUTGOING_FROM = "user@magnis.local";

export const str = (d: Data, k: string): string | null => {
  const v = d[k];
  return typeof v === "string" && v.length > 0 ? v : null;
};

/// Lowercased, trimmed address (the hub key); null if empty.
export function lowerAddr(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

/// Split a comma-separated address list into unique lowercased addresses.
function splitRecipients(csv: string | null): string[] {
  if (!csv) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of csv.split(",")) {
    const a = part.trim().toLowerCase();
    if (a.length > 0 && !seen.has(a)) {
      seen.add(a);
      out.push(a);
    }
  }
  return out;
}

/// Every unique recipient address (To + Cc + Bcc), lowercased + deduped. All
/// three are real recipients: each gets a `sent_to` link and is included in a
/// LIVE trigger's touched ids, so a trigger watching a Cc'd/Bcc'd address (e.g.
/// "watch my inbox") fires and the recipient's contact surfaces the message.
export function recipientsOf(p: Data): string[] {
  const set = new Set<string>();
  for (const field of ["to_addresses", "cc_addresses", "bcc_addresses"]) {
    for (const r of splitRecipients(str(p, field))) set.add(r);
  }
  return [...set];
}

/// Every unique address (sender + all recipients) a message contributes — used
/// to size the apply_batch chunk by TOTAL entities, not message count.
export function addressesOf(p: Data): string[] {
  const set = new Set<string>(recipientsOf(p));
  const from = lowerAddr(str(p, "from_address"));
  if (from) set.add(from);
  return [...set];
}

/// Local destination for a downloaded attachment (host file worker joins
/// files_dir + this). Mirrors the native dest_subpath; each segment sanitized.
export function destSubpath(account: string, remote: string, attId: string, filename: string): string {
  const san = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, "_");
  return `gmail/${san(account)}/${san(remote)}/${san(attId)}_${san(filename)}`;
}

/// Display sender: the source's from_name, else the raw from_address
/// (mirrors native extract_sender).
export function senderOf(d: Data): string | null {
  return str(d, "from_name") ?? str(d, "from_address");
}

/// List preview: the snippet, else the plain-text body (native extract_preview).
function previewOf(d: Data): string | null {
  return str(d, "snippet") ?? str(d, "body_text");
}

/// Strip the heavy rendered HTML from a list row's metadata — the list never
/// renders it, and shipping it per row bloats the page (native strip_body_html).
function stripBodyHtml(d: Data): Data {
  const { body_html: _omit, ...rest } = d;
  return rest;
}

export function buildListItem(entity: RawEntity, d: Data): MessageListItem {
  const created = entity.created_at ?? "";
  return {
    id: entity.id,
    schema_id: entity.schema_id,
    sender: senderOf(d),
    subject: entity.name && entity.name.length > 0 ? entity.name : null,
    preview: previewOf(d),
    channel: "email",
    timestamp: str(d, "sent_at") ?? created,
    created_at: created,
    metadata: stripBodyHtml(d),
  };
}
