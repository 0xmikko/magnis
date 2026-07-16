// Shared-file state for the mock-telegram connector — ported 1:1 from the Rust
// `magnis-mock-telegram` binary. All children spawned by the host coordinate
// ONLY through the MOCK_INJECT_FILE JSONL: one line per injected item,
// `{ surface, payload, remote_id, kind }`.

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/** The single surface this connector feeds. */
export const SURFACE = "telegram";

export interface StoredItem {
  surface: string;
  payload: Record<string, unknown>;
  remote_id: string;
  kind: string;
}

/** MOCK_INJECT_FILE is REQUIRED — the Rust twin panics without it (no fallback). */
export function injectFile(): string {
  const path = process.env.MOCK_INJECT_FILE;
  if (!path) {
    throw new Error("magnis-mock-telegram requires MOCK_INJECT_FILE (shared JSONL path)");
  }
  return path;
}

/** Every injected item for `surface`, in append order. Missing file ⇒ empty. */
export function readItems(surface: string): StoredItem[] {
  // Resolve OUTSIDE the read guard: a missing env var is fatal, an absent file
  // is just an empty page (mirrors the Rust split of panic vs `let Ok(..) else`).
  const path = injectFile();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const out: StoredItem[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const item = parsed as StoredItem;
    if (item && typeof item === "object" && item.surface === surface) out.push(item);
  }
  return out;
}

/** Append one canonical item line. `kind` is stored per item (chats snapshot,
 * messages live) so the host fires triggers only for live messages. Returns the
 * surface's new total count. */
export function appendItem(
  payload: Record<string, unknown>,
  remoteId: string,
  kind: string,
): number {
  const path = injectFile();
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // Rust ignores create_dir_all's error too; the append below reports it.
  }
  appendFileSync(
    path,
    JSON.stringify({ surface: SURFACE, payload, remote_id: remoteId, kind }) + "\n",
  );
  return readItems(SURFACE).length;
}
