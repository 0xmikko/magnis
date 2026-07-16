// Differential parity harness (TS-port S6 gate): drive the Rust connector and
// its TypeScript twin with the SAME fixture over stdio and diff the wire.
//
// Both connectors' fixture modes run their REAL converters with no network, so a
// diff of the envelopes is a true equivalence proof for the conversion layer —
// the thing that licenses deleting the Rust implementation.
//
//   bun run scripts/diff-connectors.ts [google|telegram|both]
//
// Env:
//   RUST_BIN_DIR   dir holding magnis-google / magnis-telegram
//                  (default: ../magnis-app/target/debug)
//
// ── WHAT IS NORMALIZED (and nothing else) ─────────────────────────────────
// 1. `serverInfo` — name/version differ by design (magnis-google vs
//    magnis-google-ts). Dropped from comparison.
// 2. WALL-CLOCK / RANDOM fields, listed explicitly in NONDETERMINISTIC below.
//    These are not "differences by design" — they are values that differ
//    between two runs of the SAME binary, so no cross-implementation claim can
//    be made about them at all. They are REPORTED as uncomparable rather than
//    silently equated, and their TYPE is still asserted.
// Everything else — key order, null-vs-absent, number-vs-string, array order,
// timestamp formatting — is a REAL diff and is reported.

import { spawn } from "node:child_process";
import { resolve } from "node:path";

type Rpc = { id: number; method: string; params?: unknown; note?: string };
type Reply = { result?: unknown; error?: unknown };

const REPO = resolve(import.meta.dir, "..");
const RUST_BIN_DIR =
  process.env.RUST_BIN_DIR ?? resolve(REPO, "../magnis-app/target/debug");
const TIMEOUT_MS = 20_000;

/** Wall-clock / random values: differ between two runs of the SAME binary, so
 * they carry no parity signal. Path is the readable dotted path from the RPC
 * result root. Each entry says WHY it cannot be compared. */
const NONDETERMINISTIC: { path: RegExp; why: string; type: string }[] = [
  {
    // telegram fixture.rs:157 `chrono::Utc::now().to_rfc3339()`
    path: /^\.result\.nextCursor\.date$/,
    why: "telegram fixture.rs:157 stamps Utc::now() into the cursor",
    type: "string",
  },
  {
    // google fixture.rs:232 `uuid::Uuid::new_v4()`; telegram fixture.rs:238 SystemTime nanos
    path: /^\.result\.message_id$/,
    why: "google fixture.rs:232 mints a random uuid; telegram fixture.rs:238 uses SystemTime nanos",
    type: "string|number",
  },
];

function nondet(path: string) {
  return NONDETERMINISTIC.find((n) => n.path.test(path));
}

// ── stdio driver ──────────────────────────────────────────────────────────

interface DriveOutput {
  replies: Record<number, Reply>;
  /** id-less frames (notifications/magnis/envelope pushes), in arrival order. */
  notifications: unknown[];
  /** Every frame in ARRIVAL order as `reply:<id>` / `push`. The relative order
   * of an ack and the pushes that follow it is wire-visible: the host routes a
   * push by subscription_id, so a push BEFORE its listen ack is a real defect. */
  frameOrder: string[];
  stderr: string;
  timedOut: boolean;
}

/** Feed `reqs` to a connector over stdio and collect its JSON-RPC replies.
 * Bounded by TIMEOUT_MS: a hang is REPORTED, never silently skipped. */
async function drive(
  cmd: string[],
  env: Record<string, string>,
  reqs: Rpc[],
  cwd?: string,
  /** Extra ms to keep reading AFTER all replies land — lets async push
   * notifications (magnis.sync.listen) arrive before we reap the process. */
  settleMs = 0,
): Promise<DriveOutput> {
  const p = spawn(cmd[0], cmd.slice(1), {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const replies: Record<number, Reply> = {};
  const notifications: unknown[] = [];
  const frameOrder: string[] = [];
  let stderr = "";
  let buf = "";
  let timedOut = false;

  const expected = new Set(reqs.map((r) => r.id));
  let settle: () => void;
  const allIn = new Promise<void>((res) => (settle = res));

  p.stdout.on("data", (d) => {
    buf += String(d);
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const m = JSON.parse(line);
        if (m.id === undefined || m.id === null) {
          notifications.push(m); // push frame (notifications/magnis/envelope)
          frameOrder.push("push");
          continue;
        }
        frameOrder.push(`reply:${m.id}`);
        replies[Number(m.id)] = "result" in m ? { result: m.result } : { error: m.error };
        expected.delete(Number(m.id));
        if (expected.size === 0) settle();
      } catch {
        /* log line on stdout — not a JSON-RPC frame */
      }
    }
  });
  p.stderr.on("data", (d) => (stderr += String(d)));

  for (const r of reqs) {
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: r.id, method: r.method, params: r.params ?? {} }) + "\n");
  }

  const timer = new Promise<void>((res) =>
    setTimeout(() => {
      timedOut = expected.size > 0;
      res();
    }, TIMEOUT_MS),
  );
  await Promise.race([allIn, timer]);
  if (settleMs > 0) await new Promise((res) => setTimeout(res, settleMs));

  // Always reap: never leave a stray connector behind.
  p.stdin.end();
  p.kill("SIGKILL");
  await new Promise((res) => p.on("close", res));

  if (timedOut) {
    console.log(`  ! HANG: ${cmd.join(" ")} did not answer ids [${[...expected].join(", ")}] within ${TIMEOUT_MS}ms`);
  }
  return { replies, notifications, frameOrder, stderr, timedOut };
}

// ── diffing ───────────────────────────────────────────────────────────────

interface Diff {
  path: string;
  rust: string;
  ts: string;
}

const show = (v: unknown) => (v === undefined ? "<absent>" : JSON.stringify(v));

/** Structural diff preserving null-vs-absent, types, and array order. */
function diff(a: unknown, b: unknown, path = ""): Diff[] {
  const nd = nondet(path);
  if (nd !== undefined) {
    // Cannot compare the value; still assert both sides produced the right TYPE.
    const types = nd.type.split("|");
    const ok = (v: unknown) => types.includes(typeof v);
    if (!ok(a) || !ok(b)) {
      return [{ path: `${path} (nondeterministic — type check)`, rust: `${typeof a}`, ts: `${typeof b}` }];
    }
    return [];
  }

  if (a === undefined || b === undefined || a === null || b === null) {
    return Object.is(a, b) ? [] : [{ path: path || "<root>", rust: show(a), ts: show(b) }];
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return [{ path: path || "<root>", rust: show(a), ts: show(b) }];
    }
    if (a.length !== b.length) {
      return [{ path: `${path}.length`, rust: String(a.length), ts: String(b.length) }];
    }
    return a.flatMap((_, i) => diff(a[i], b[i], `${path}[${i}]`));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    const out: Diff[] = [];
    for (const k of new Set([...ak, ...bk])) {
      if (k === "serverInfo") continue; // name/version differ by design
      out.push(...diff((a as any)[k], (b as any)[k], `${path}.${k}`));
    }
    return out;
  }
  if (typeof a !== typeof b || a !== b) {
    return [{ path: path || "<root>", rust: show(a), ts: show(b) }];
  }
  return [];
}

/** Key ORDER, reported separately: JSON objects are unordered by spec, and
 * serde_json (BTreeMap) sorts keys while JS preserves insertion order — so this
 * is a wire-visible-but-semantically-neutral difference the user should SEE
 * rather than have hidden. Never counted as a parity failure. */
function keyOrderDiffs(a: unknown, b: unknown, path = ""): string[] {
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return [];
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.flatMap((_, i) => keyOrderDiffs(a[i], b[i], `${path}[${i}]`));
  }
  if (Array.isArray(a) || Array.isArray(b)) return [];
  const ak = Object.keys(a as object).filter((k) => k !== "serverInfo");
  const bk = Object.keys(b as object).filter((k) => k !== "serverInfo");
  const out: string[] = [];
  if (ak.length === bk.length && ak.join(",") !== bk.join(",") && [...ak].sort().join(",") === [...bk].sort().join(",")) {
    out.push(`${path || "<root>"}: rust [${ak.join(", ")}] vs ts [${bk.join(", ")}]`);
  }
  for (const k of ak) {
    if (k in (b as object)) out.push(...keyOrderDiffs((a as any)[k], (b as any)[k], `${path}.${k}`));
  }
  return out;
}

// ── reporting ─────────────────────────────────────────────────────────────

let totalDiffs = 0;
let totalHangs = 0;
const orderNotes: string[] = [];

function report(label: string, rust: Reply | undefined, ts: Reply | undefined): void {
  if (rust === undefined || ts === undefined) {
    totalDiffs++;
    console.log(`  ✗ ${label} — NO REPLY from ${rust === undefined ? "rust" : "ts"}`);
    return;
  }
  // An error-vs-result mismatch is itself a diff; compare the whole reply frame.
  const ds = diff(rust, ts);
  const ko = keyOrderDiffs(rust, ts);
  for (const line of ko) orderNotes.push(`${label} ${line}`);

  if (ds.length === 0) {
    console.log(`  ✓ ${label} — IDENTICAL${ko.length > 0 ? ` (key order differs at ${ko.length} node(s))` : ""}`);
    return;
  }
  totalDiffs += ds.length;
  console.log(`  ✗ ${label} — ${ds.length} diff(s):`);
  for (const d of ds.slice(0, 12)) {
    console.log(`      ${d.path}`);
    console.log(`        rust = ${d.rust.slice(0, 220)}`);
    console.log(`        ts   = ${d.ts.slice(0, 220)}`);
  }
  if (ds.length > 12) console.log(`      … and ${ds.length - 12} more`);
}

// ── pair runners ──────────────────────────────────────────────────────────

interface PairSpec {
  name: string;
  rustBin: string;
  tsDir: string;
  envKey: string;
  fixture: string;
}

async function runPair(
  spec: PairSpec,
  reqs: Rpc[],
  opts: { settleMs?: number; diffNotifications?: boolean } = {},
): Promise<Record<number, [Reply, Reply]>> {
  console.log(`\n=== ${spec.name}: same fixture → Rust vs TS ===`);
  const env = { [spec.envKey]: spec.fixture };
  const settle = opts.settleMs ?? 0;
  const rust = await drive([resolve(RUST_BIN_DIR, spec.rustBin)], env, reqs, undefined, settle);
  const ts = await drive(["bun", "run", "src/main.ts"], env, reqs, resolve(REPO, spec.tsDir), settle);
  if (rust.timedOut || ts.timedOut) totalHangs++;

  if (opts.diffNotifications === true) {
    report("push notifications (magnis.sync.listen replay)", { result: rust.notifications }, { result: ts.notifications });
    // Frame ORDER, not just frame content: a push must never precede its ack.
    report("push/ack FRAME ORDER", { result: rust.frameOrder }, { result: ts.frameOrder });
  }

  const paired: Record<number, [Reply, Reply]> = {};
  for (const r of reqs) {
    report(`id=${r.id} ${r.method}${r.note !== undefined ? ` [${r.note}]` : ""}`, rust.replies[r.id], ts.replies[r.id]);
    if (rust.replies[r.id] !== undefined && ts.replies[r.id] !== undefined) {
      paired[r.id] = [rust.replies[r.id], ts.replies[r.id]];
    }
  }
  return paired;
}

const call = (id: number, name: string, args: unknown, note?: string): Rpc => ({
  id,
  method: "tools/call",
  params: { name, arguments: args },
  note,
});

/** Drain a surface page-by-page, feeding nextCursor back until hasMore=false.
 * Both fixture seams are single-page by construction, so this loop proves the
 * TERMINATION contract (hasMore=false + cursor shape) rather than real API
 * pagination — see the report's coverage section. */
async function drainPages(
  spec: PairSpec,
  baseArgs: Record<string, unknown>,
  startId: number,
  label: string,
): Promise<void> {
  let cursor: unknown = undefined;
  let page = 0;
  const MAX_PAGES = 10;
  while (page < MAX_PAGES) {
    const args = { ...baseArgs, ...(cursor === undefined || cursor === null ? {} : { cursor }) };
    const id = startId + page;
    const req = call(id, "magnis.sync.fetch", args, `${label} page ${page}`);
    const paired = await runPair(spec, [req]);
    const entry = paired[id];
    if (entry === undefined) return;
    const rustRes = (entry[0].result ?? {}) as Record<string, unknown>;
    const tsRes = (entry[1].result ?? {}) as Record<string, unknown>;
    if (rustRes.hasMore !== true || tsRes.hasMore !== true) {
      if (rustRes.hasMore !== tsRes.hasMore) {
        totalDiffs++;
        console.log(`  ✗ ${label}: hasMore disagrees — rust=${rustRes.hasMore} ts=${tsRes.hasMore}`);
      }
      return;
    }
    cursor = rustRes.nextCursor;
    page++;
  }
  console.log(`  ! ${label}: pagination did not terminate in ${MAX_PAGES} pages`);
}

// ── suites ────────────────────────────────────────────────────────────────

const GOOGLE: PairSpec = {
  name: "google",
  rustBin: "magnis-google",
  tsDir: "plugins/sources/google-ts",
  envKey: "GOOGLE_FIXTURE_FILE",
  fixture: resolve(REPO, "scripts/fixtures/parity/google.json"),
};

const TELEGRAM: PairSpec = {
  name: "telegram",
  rustBin: "magnis-telegram",
  tsDir: "plugins/sources/telegram-ts",
  envKey: "TELEGRAM_FIXTURE_FILE",
  fixture: resolve(REPO, "scripts/fixtures/parity/telegram.json"),
};

async function google(): Promise<void> {
  await runPair(GOOGLE, [
    { id: 1, method: "initialize", params: {}, note: "protocolVersion + capabilities" },
    { id: 2, method: "tools/list", note: "advertised tool surface" },
  ]);
  for (const [i, surface] of ["email", "meetings", "contacts"].entries()) {
    await drainPages(GOOGLE, { surface }, 100 + i * 20, `fetch ${surface} (backward)`);
    await drainPages(GOOGLE, { surface, direction: "forward" }, 160 + i * 20, `fetch ${surface} (forward)`);
  }
  await runPair(GOOGLE, [
    call(300, "magnis.sync.fetch", { surface: "unknown-surface" }, "unknown surface"),
    call(301, "magnis.execute", { action: "send_message", draft: { to: [], subject: "s", body_text: "b" } }, "execute send_message"),
    call(302, "magnis.execute", { action: "download_file", dest: "/tmp/x.bin", source_ref: { message_id: "m7", attachment_id: "att-1" } }, "execute download_file"),
    call(303, "magnis.execute", { action: "bogus_action" }, "execute unknown action"),
    call(304, "magnis.does.not.exist", {}, "unknown tool"),
  ]);
}

async function telegram(): Promise<void> {
  await runPair(TELEGRAM, [
    { id: 1, method: "initialize", params: {}, note: "protocolVersion + capabilities" },
    { id: 2, method: "tools/list", note: "advertised tool surface" },
  ]);
  await drainPages(TELEGRAM, { direction: "backward" }, 100, "fetch (backward/bootstrap)");
  await drainPages(TELEGRAM, { direction: "forward" }, 120, "fetch (forward, no cursor)");

  // Cursor round-trip: take the BOOTSTRAP cursor and replay it as a catch-up.
  // This is where a port most plausibly drifts (watermark filtering).
  const boot = await runPair(TELEGRAM, [
    call(140, "magnis.sync.fetch", { direction: "backward" }, "bootstrap for cursor capture"),
  ]);
  const rustCursor = ((boot[140]?.[0].result ?? {}) as Record<string, unknown>).nextCursor;
  const tsCursor = ((boot[140]?.[1].result ?? {}) as Record<string, unknown>).nextCursor;
  if (rustCursor !== undefined && rustCursor !== null) {
    // Feed the RUST cursor to BOTH (rust is the oracle), then the TS cursor to
    // BOTH — a cursor either side mints must be honoured identically by both.
    await runPair(TELEGRAM, [
      call(141, "magnis.sync.fetch", { direction: "forward", cursor: rustCursor }, "catch-up with RUST cursor (expect chats only)"),
    ]);
    await runPair(TELEGRAM, [
      call(142, "magnis.sync.fetch", { direction: "forward", cursor: tsCursor }, "catch-up with TS cursor (cross-fed)"),
    ]);
    // Partial watermark: below the max → the newer messages must still come.
    await runPair(TELEGRAM, [
      call(143, "magnis.sync.fetch", { direction: "forward", cursor: { chats: { "111": { last_msg_id: 30 }, "222": { last_msg_id: 1 } } } }, "catch-up, partial watermark"),
    ]);
    // Watermark above everything → chats only, no messages.
    await runPair(TELEGRAM, [
      call(144, "magnis.sync.fetch", { direction: "forward", cursor: { chats: { "111": { last_msg_id: 9999 } } } }, "catch-up, watermark above all"),
    ]);
  }

  // ── push replay: the fixture's `live: true` message must be pushed as a
  // notifications/magnis/envelope frame with an IDENTICAL param shape. This is
  // the one async surface the fixture seam covers, and dispatch.ts calls out
  // four places the SDK would have drifted here — so it is worth diffing.
  await runPair(
    TELEGRAM,
    [
      call(150, "magnis.sync.listen", { _meta: { account_id: "acct-1" } }, "listen (legacy, sub id from account)"),
    ],
    { settleMs: 1500, diffNotifications: true },
  );
  await runPair(
    TELEGRAM,
    [
      call(151, "magnis.sync.listen_start", { subscription_id: "sub:A", _meta: { account_id: "acct-1" } }, "listen_start"),
      call(152, "magnis.sync.listen_stop", { subscription_id: "sub:A" }, "listen_stop"),
      call(153, "magnis.sync.listen_stop", { subscription_id: "sub:never-started" }, "listen_stop unknown sub (must not error)"),
      call(154, "magnis.sync.listen_start", {}, "listen_start WITHOUT subscription_id (expect -32602)"),
    ],
    { settleMs: 1500, diffNotifications: true },
  );

  await runPair(TELEGRAM, [
    call(200, "magnis.execute", { action: "send_message", chat_id: 111, text: "hi" }, "execute send_message"),
    call(201, "magnis.execute", { action: "reply", chat_id: 111, text: "re", reply_to: 10 }, "execute reply"),
    call(202, "magnis.execute", { action: "backfill_chat", chat_id: 111 }, "execute backfill_chat"),
    call(203, "magnis.execute", { action: "download_file", dest: "/tmp/y.jpg" }, "execute download_file"),
    call(204, "magnis.execute", { action: "bogus_action" }, "execute unknown action"),
    call(205, "magnis.does.not.exist", {}, "unknown tool"),
  ]);
}

// ── main ──────────────────────────────────────────────────────────────────

const which = process.argv[2] ?? "both";
if (which === "google" || which === "both") await google();
if (which === "telegram" || which === "both") await telegram();

if (orderNotes.length > 0) {
  console.log(`\n── KEY-ORDER NOTES (wire-visible, semantically neutral; NOT counted) ──`);
  for (const n of orderNotes.slice(0, 15)) console.log(`  · ${n}`);
  if (orderNotes.length > 15) console.log(`  … and ${orderNotes.length - 15} more`);
}

console.log(
  totalDiffs === 0 && totalHangs === 0
    ? `\nPARITY: IDENTICAL ✓`
    : `\nPARITY: ${totalDiffs} DIFF(S), ${totalHangs} HANG(S) ✗`,
);
process.exit(totalDiffs === 0 && totalHangs === 0 ? 0 : 1);
