import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConnectorError } from "@magnis/connector-sdk";
import { fetchStateMock, probeStateMock } from "./index";
import { arg, logCall, mode, nextStep, surfaces } from "./state";

// Wire-parity suite for the TS StateMock: every MockStep op the Rust twin
// implemented, the file-backed queue semantics, and the call log the sync-status
// stories (stage_13) assert on.

let dir: string;
let argvBackup: string[];

/** Drive the CLI contract the archetype manifests pass at spawn. */
function withArgv(...args: string[]): void {
  process.argv = ["bun", "src/main.ts", ...args];
}

function program(p: Record<string, unknown[]>): void {
  writeFileSync(join(dir, "program.json"), JSON.stringify(p));
}

function calls(): Array<Record<string, unknown>> {
  try {
    return readFileSync(join(dir, "calls.jsonl"), "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "statemock-"));
  argvBackup = process.argv;
  withArgv("--surfaces", "smk", "--mode", "poll", "--state-dir", dir);
});

afterEach(() => {
  process.argv = argvBackup;
  rmSync(dir, { recursive: true, force: true });
});

describe("StateMock CLI shape", () => {
  test("tst_conn_statemock_ts_001 --surfaces/--mode/--state-dir drive the archetype", () => {
    expect(surfaces()).toEqual(["smk"]);
    expect(mode()).toBe("poll");
    expect(arg("state-dir")).toBe(dir);

    withArgv("--surfaces", "smo-a,smo-b, smo-c", "--mode", "push");
    expect(surfaces()).toEqual(["smo-a", "smo-b", "smo-c"]); // trimmed
    expect(mode()).toBe("push");

    withArgv(); // zero-config archetype
    expect(surfaces()).toEqual(["mock"]);
    expect(mode()).toBe("poll");
    expect(arg("state-dir")).toBeUndefined();
  });
});

describe("StateMock fetch ops", () => {
  test("tst_conn_statemock_ts_002 an empty queue ⇒ a clean empty page", async () => {
    expect(await fetchStateMock({ surface: "smk" })).toEqual({
      envelopes: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  test("tst_conn_statemock_ts_003 no --state-dir ⇒ unprogrammable, always empty", async () => {
    withArgv("--surfaces", "smk");
    expect(await fetchStateMock({ surface: "smk" })).toEqual({
      envelopes: [],
      nextCursor: null,
      hasMore: false,
    });
    expect(nextStep("smk")).toBeNull();
  });

  test("tst_conn_statemock_ts_004 fetch_ok synthesizes N envelopes + cursor-driven hasMore", async () => {
    program({ smk: [{ op: "fetch_ok", envelopes: 2, next_cursor: { page: 2 } }] });
    const out = await fetchStateMock({ surface: "smk", cursor: { page: 1 } });
    expect(out.envelopes).toEqual([
      { surface: "smk", payload: { n: 0 }, remote_id: "sm-smk-0", kind: "snapshot" },
      { surface: "smk", payload: { n: 1 }, remote_id: "sm-smk-1", kind: "snapshot" },
    ]);
    expect(out.nextCursor).toEqual({ page: 2 });
    expect(out.hasMore).toBe(true); // has_more = next_cursor is non-null
  });

  test("tst_conn_statemock_ts_005 fetch_ok with no next_cursor drains the surface", async () => {
    program({ smk: [{ op: "fetch_ok", envelopes: 1 }] });
    const out = await fetchStateMock({ surface: "smk" });
    expect(out.envelopes).toHaveLength(1);
    expect(out.nextCursor).toBeNull();
    expect(out.hasMore).toBe(false);
    expect(out).not.toHaveProperty("total");
  });

  test("tst_conn_statemock_ts_006 total/total_exact appear ONLY when programmed non-null", async () => {
    program({
      smk: [
        { op: "fetch_ok", envelopes: 0, total: 57, total_exact: false },
        { op: "fetch_ok", envelopes: 0, total: null, total_exact: null },
      ],
    });
    const withTotals = (await fetchStateMock({ surface: "smk" })) as Record<string, unknown>;
    expect(withTotals.total).toBe(57);
    expect(withTotals.total_exact).toBe(false);

    const without = (await fetchStateMock({ surface: "smk" })) as Record<string, unknown>;
    expect(without).not.toHaveProperty("total");
    expect(without).not.toHaveProperty("total_exact");
  });

  test("tst_conn_statemock_ts_007 fetch_ok_no_cursor is the contract violation (hasMore, no cursor)", async () => {
    program({ smk: [{ op: "fetch_ok_no_cursor" }] });
    expect(await fetchStateMock({ surface: "smk" })).toEqual({
      envelopes: [],
      nextCursor: null,
      hasMore: true,
    });
  });

  test("tst_conn_statemock_ts_008 fetch_error throws the TYPED error verbatim", async () => {
    program({ smk: [{ op: "fetch_error", error: { kind: "rate_limited", retry_after: 30 } }] });
    const e = (await fetchStateMock({ surface: "smk" }).catch((x) => x)) as ConnectorError;
    expect(e).toBeInstanceOf(ConnectorError);
    // No `message` in the programmed error ⇒ the Rust default string.
    expect(e.message).toBe("programmed error");
    expect(e.data).toEqual({ kind: "rate_limited", retry_after: 30 });
    expect(e.code).toBe(-32000); // NOT the -32002 rate-limit code: parity with Rust

    // A bare `fetch_error` defaults to kind "internal".
    program({ smk: [{ op: "fetch_error" }] });
    const bare = (await fetchStateMock({ surface: "smk" }).catch((x) => x)) as ConnectorError;
    expect(bare.data).toEqual({ kind: "internal" });

    // A programmed message wins.
    program({ smk: [{ op: "fetch_error", error: { kind: "auth", message: "token dead" } }] });
    const msg = (await fetchStateMock({ surface: "smk" }).catch((x) => x)) as ConnectorError;
    expect(msg.message).toBe("token dead");
  });

  test("tst_conn_statemock_ts_009 an unknown op is a contract error", async () => {
    program({ smk: [{ op: "teleport" }] });
    const e = (await fetchStateMock({ surface: "smk" }).catch((x) => x)) as ConnectorError;
    expect(e.message).toBe("unprogrammed op teleport");
    expect(e.data).toEqual({ kind: "contract", message: "unprogrammed op teleport" });
  });

  test("tst_conn_statemock_ts_010 fetch_hang stalls, then answers empty", async () => {
    program({ smk: [{ op: "fetch_hang", ms: 60 }] });
    const started = Date.now();
    const out = await fetchStateMock({ surface: "smk" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
    expect(out).toEqual({ envelopes: [], nextCursor: null, hasMore: false });
  });
});

describe("StateMock queue + call log", () => {
  test("tst_conn_statemock_ts_011 steps are consumed once, per surface, across processes", async () => {
    program({
      smk: [{ op: "fetch_ok", envelopes: 1 }, { op: "fetch_ok_no_cursor" }],
      other: [{ op: "fetch_ok", envelopes: 3 }],
    });
    // First call pops step 1 and REWRITES the file (the child dies between calls).
    expect((await fetchStateMock({ surface: "smk" })).envelopes).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(dir, "program.json"), "utf8"))).toEqual({
      smk: [{ op: "fetch_ok_no_cursor" }],
      other: [{ op: "fetch_ok", envelopes: 3 }],
    });
    expect((await fetchStateMock({ surface: "smk" })).hasMore).toBe(true);
    // Queue drained ⇒ back to a clean empty page; the other surface is untouched.
    expect((await fetchStateMock({ surface: "smk" })).hasMore).toBe(false);
    expect((await fetchStateMock({ surface: "other" })).envelopes).toHaveLength(3);
  });

  test("tst_conn_statemock_ts_012 every call is logged with its surface + cursor", async () => {
    await fetchStateMock({ surface: "smk", cursor: { page: 7 } });
    await fetchStateMock({ surface: "smk" });
    await probeStateMock();
    expect(calls()).toEqual([
      { surface: "smk", tool: "magnis.sync.fetch", cursor: { page: 7 } },
      { surface: "smk", tool: "magnis.sync.fetch", cursor: null },
      { surface: "__auth__", tool: "magnis.auth.probe" },
    ]);
  });

  test("tst_conn_statemock_ts_013 no --state-dir ⇒ NO call log (a clean base leaves nothing)", async () => {
    withArgv("--surfaces", "smk");
    await fetchStateMock({ surface: "smk" });
    logCall({ surface: "x", tool: "y" });
    expect(calls()).toEqual([]);
  });
});

describe("StateMock probe", () => {
  test("tst_conn_statemock_ts_014 unprogrammed probe answers the default identity", async () => {
    expect(await probeStateMock()).toEqual({ subject: "statemock" });
  });

  test("tst_conn_statemock_ts_015 probe_ok returns the programmed subject", async () => {
    program({ __auth__: [{ op: "probe_ok", subject: "user@acme" }] });
    expect(await probeStateMock()).toEqual({ subject: "user@acme" });
  });

  test("tst_conn_statemock_ts_016 probe_reject fails the probe (the SDK types it as auth)", async () => {
    program({ __auth__: [{ op: "probe_reject", message: "bad key" }] });
    expect(probeStateMock()).rejects.toThrow("bad key");
    program({ __auth__: [{ op: "probe_reject" }] });
    expect(probeStateMock()).rejects.toThrow("rejected"); // Rust's default message
  });
});
