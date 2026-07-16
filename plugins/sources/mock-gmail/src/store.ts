// Shared-file state for the mock-gmail connector.
//
// The host spawns ONE child per (surface, account) — both children run this
// same connector and coordinate ONLY through a JSONL file (MOCK_INJECT_FILE):
// one line per injected item, `{ surface, payload, remote_id }`. Ported 1:1
// from the Rust `magnis-mock-gmail` binary (read_items / append_item).

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export interface StoredItem {
  surface: string;
  payload: Record<string, unknown>;
  remote_id: string;
}

/** MOCK_INJECT_FILE is REQUIRED — the Rust twin panics without it (no fallback). */
export function injectFile(): string {
  const path = process.env.MOCK_INJECT_FILE;
  if (!path) {
    throw new Error("magnis-mock-gmail requires MOCK_INJECT_FILE (shared JSONL path)");
  }
  return path;
}

/** Every injected item for `surface`, in append order. Missing file ⇒ empty. */
export function readItems(surface: string): StoredItem[] {
  // Resolve OUTSIDE the read guard: a missing MOCK_INJECT_FILE is fatal (the
  // Rust twin panics), while an absent/unreadable file is just an empty page.
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
      continue; // Rust: filter_map(from_str.ok()) — malformed lines are skipped
    }
    const item = parsed as StoredItem;
    if (item && typeof item === "object" && item.surface === surface) out.push(item);
  }
  return out;
}

/** Append one canonical item line. Returns the surface's new total count. */
export function appendItem(
  surface: string,
  payload: Record<string, unknown>,
  remoteId: string,
): number {
  const path = injectFile();
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // Rust ignores the create_dir_all error too; the append below reports it.
  }
  appendFileSync(path, JSON.stringify({ surface, payload, remote_id: remoteId }) + "\n");
  return readItems(surface).length;
}
