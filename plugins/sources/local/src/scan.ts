// Notes-directory scan — ported 1:1 from the Rust `magnis-local` binary.
//
// Env:
//   NOTES_DIR    notes directory (defaults to `$STORAGE_DIR/notes`)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

export interface Entry {
  /** Path relative to the notes dir — also the envelope's remote_id. */
  path: string;
  filename: string;
  body: string;
  size: number;
  /** Whole seconds since the epoch (Rust: `duration_since(UNIX_EPOCH).as_secs()`). */
  mtime: number;
}

/** NOTES_DIR, else $STORAGE_DIR/notes. Neither ⇒ fatal (the Rust twin panics). */
export function notesDir(): string {
  const dir = process.env.NOTES_DIR;
  if (dir) return dir;
  const storage = process.env.STORAGE_DIR;
  if (storage) return join(storage, "notes");
  throw new Error("magnis-local requires NOTES_DIR or STORAGE_DIR");
}

/** Scan the notes dir for `*.md` files (recursive), newest `mtime` first
 * (ties broken by path, ascending). Unreadable dirs/files are skipped. */
export function scan(base: string): Entry[] {
  const out: Entry[] = [];
  const stack: string[] = [base];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue; // Rust: `let Ok(rd) = read_dir(..) else { continue }`
    }
    for (const name of names) {
      const p = join(dir, name);
      let stats;
      try {
        stats = statSync(p);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        stack.push(p);
        continue;
      }
      // `extname` mirrors Rust's `Path::extension` (a bare ".md" has none).
      if (extname(p) !== ".md") continue;
      let body: string;
      try {
        body = readFileSync(p, "utf8"); // lossy UTF-8, as in Rust
      } catch {
        continue;
      }
      out.push({
        path: relative(base, p),
        filename: name,
        body,
        size: stats.size,
        mtime: Math.floor(stats.mtimeMs / 1000),
      });
    }
  }
  out.sort((a, b) => b.mtime - a.mtime || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}
