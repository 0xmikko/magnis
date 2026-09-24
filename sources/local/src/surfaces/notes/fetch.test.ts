import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchLocalNotes } from "./fetch";
import { notesDir, scan } from "./scan";

// Wire-parity suite for the TS local connector: the assertions mirror the Rust
// connector's own e2e (tst_conn_local_001/002) plus the mtime cursor semantics.

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "local-notes-"));
  process.env.NOTES_DIR = dir;
  delete process.env.STORAGE_DIR;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.NOTES_DIR;
  delete process.env.STORAGE_DIR;
});

/** Write a note with a fixed mtime so ordering/cursor tests are deterministic. */
function note(rel: string, body: string, mtimeSecs: number): void {
  const p = join(dir, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
  utimesSync(p, mtimeSecs, mtimeSecs);
}

describe("local notes fetch", () => {
  // tst_conn_local_ts_001 — twin of the Rust tst_conn_local_001.
  test("tst_conn_local_ts_001 backward serves every *.md as a canonical note", async () => {
    note("a.md", "# Alpha\nbody a", 1_700_000_100);
    note("b.md", "# Bravo\nbody b", 1_700_000_200);
    writeFileSync(join(dir, "ignore.txt"), "nope"); // non-md ignored

    const out = await fetchLocalNotes({ surface: "notes", direction: "backward" });
    expect(out.envelopes).toHaveLength(2);
    expect(out.hasMore).toBe(false);

    const a = out.envelopes.find((e) => e.payload.path === "a.md")!;
    expect(a.payload.filename).toBe("a.md");
    expect(a.payload.body).toContain("body a");
    expect(a.payload.size).toBe(Buffer.byteLength("# Alpha\nbody a"));
    expect(a.payload.mtime).toBe(1_700_000_100);
    expect(a.payload.content_hash).toBe(
      createHash("sha256").update("# Alpha\nbody a").digest("hex"),
    );
    expect(a.remote_id).toBe("a.md");
    // The Rust connector emits NO `kind` — the host defaults it to snapshot.
    expect(a).not.toHaveProperty("kind");

    // nextCursor is the newest mtime across ALL notes.
    expect(out.nextCursor).toEqual({ last_mtime: 1_700_000_200 });
  });

  test("tst_conn_local_ts_002 newest first, ties broken by path", async () => {
    note("z.md", "z", 1_700_000_100);
    note("a.md", "a", 1_700_000_100);
    note("newest.md", "n", 1_700_000_999);
    const { envelopes } = await fetchLocalNotes({ surface: "notes" });
    expect(envelopes.map((e) => e.payload.path)).toEqual(["newest.md", "a.md", "z.md"]);
  });

  // tst_conn_local_ts_003 — twin of the Rust tst_conn_local_002.
  test("tst_conn_local_ts_003 empty dir ⇒ zero envelopes and a null cursor", async () => {
    const out = await fetchLocalNotes({ surface: "notes", direction: "backward" });
    expect(out.envelopes).toHaveLength(0);
    expect(out.nextCursor).toBeNull();
  });

  test("tst_conn_local_ts_004 forward past the newest mtime ⇒ nothing new", async () => {
    note("a.md", "a", 1_700_000_100);
    note("b.md", "b", 1_700_000_200);
    const out = await fetchLocalNotes({
      surface: "notes",
      direction: "forward",
      cursor: { last_mtime: 1_700_000_200 },
    });
    expect(out.envelopes).toHaveLength(0);
    // The cursor still reports the newest mtime, so it never regresses.
    expect(out.nextCursor).toEqual({ last_mtime: 1_700_000_200 });
  });

  test("tst_conn_local_ts_005 forward returns ONLY notes strictly past the cursor", async () => {
    note("old.md", "old", 1_700_000_100);
    note("new.md", "new", 1_700_000_300);
    const out = await fetchLocalNotes({
      surface: "notes",
      direction: "forward",
      cursor: { last_mtime: 1_700_000_200 },
    });
    expect(out.envelopes.map((e) => e.payload.path)).toEqual(["new.md"]);
    expect(out.nextCursor).toEqual({ last_mtime: 1_700_000_300 });
  });

  test("tst_conn_local_ts_006 backward IGNORES the cursor (bootstrap re-reads all)", async () => {
    note("a.md", "a", 1_700_000_100);
    const out = await fetchLocalNotes({
      surface: "notes",
      direction: "backward",
      cursor: { last_mtime: 1_700_000_999 },
    });
    expect(out.envelopes).toHaveLength(1);
  });

  test("tst_conn_local_ts_007 nested dirs are scanned; path is dir-relative", async () => {
    note(join("sub", "deep.md"), "deep", 1_700_000_100);
    const { envelopes } = await fetchLocalNotes({ surface: "notes" });
    expect(envelopes[0]!.payload.path).toBe(join("sub", "deep.md"));
    expect(envelopes[0]!.payload.filename).toBe("deep.md");
    expect(envelopes[0]!.remote_id).toBe(join("sub", "deep.md"));
  });
});

describe("local notes dir resolution", () => {
  test("tst_conn_local_ts_008 NOTES_DIR wins, else $STORAGE_DIR/notes, else fatal", () => {
    expect(notesDir()).toBe(dir);
    delete process.env.NOTES_DIR;
    process.env.STORAGE_DIR = "/srv/store";
    expect(notesDir()).toBe(join("/srv/store", "notes"));
    delete process.env.STORAGE_DIR;
    expect(() => notesDir()).toThrow(/NOTES_DIR or STORAGE_DIR/);
  });

  test("tst_conn_local_ts_009 a missing notes dir scans to empty, not a throw", () => {
    expect(scan(join(dir, "does-not-exist"))).toEqual([]);
  });
});
