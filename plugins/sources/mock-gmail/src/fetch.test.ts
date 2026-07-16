import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchMockGmail } from "./fetch";
import { readItems, appendItem } from "./store";
import { buildEmail, buildEvent, injectEmail, injectEvent } from "./inject";
import { handleHttp } from "./http";

// Wire-parity suite for the TS mock-gmail: the assertions mirror the Rust
// connector's own e2e (tst_conn_mockgmail_001/002) plus the payload shapes the
// Rust `inject_email` / `inject_event` handlers built.

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mockgmail-"));
  process.env.MOCK_INJECT_FILE = join(dir, "inject.jsonl");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.MOCK_INJECT_FILE;
});

function seed(): void {
  const email = {
    surface: "email",
    payload: { message_id: "m1", from_address: "a@x", subject: "Hi", body_text: "hello" },
    remote_id: "m1",
  };
  const meeting = {
    surface: "meetings",
    payload: {
      id: "e1",
      title: "Standup",
      starts_at: "2026-05-20T10:00:00Z",
      ends_at: "2026-05-20T10:15:00Z",
      attendees: [{ email: "a@x" }],
    },
    remote_id: "gcal:e1",
  };
  writeFileSync(
    process.env.MOCK_INJECT_FILE!,
    `${JSON.stringify(email)}\n${JSON.stringify(meeting)}\n`,
  );
}

describe("mock-gmail fetch", () => {
  // tst_conn_mockgmail_ts_001 — twin of the Rust tst_conn_mockgmail_001: both
  // surfaces serve their own items, marked live, with the cursor advancing.
  test("tst_conn_mockgmail_ts_001 serves both surfaces from the shared file", async () => {
    seed();
    const out = await fetchMockGmail({ surface: "email", cursor: 0 });
    expect(out.envelopes).toHaveLength(1);
    expect(out.envelopes[0]!.payload.message_id).toBe("m1");
    expect(out.envelopes[0]!.remote_id).toBe("m1");
    expect(out.envelopes[0]!.kind).toBe("live"); // fresh arrival → trigger.check fires
    expect(out.envelopes[0]!.surface).toBe("email");
    expect(out.nextCursor).toBe(1);
    expect(out.hasMore).toBe(false);

    const meetings = await fetchMockGmail({ surface: "meetings", cursor: 0 });
    expect(meetings.envelopes).toHaveLength(1);
    expect(meetings.envelopes[0]!.payload.title).toBe("Standup");
    expect(meetings.envelopes[0]!.remote_id).toBe("gcal:e1");
    expect(meetings.nextCursor).toBe(1);
  });

  test("tst_conn_mockgmail_ts_002 cursor skips consumed items", async () => {
    seed();
    const out = await fetchMockGmail({ surface: "email", cursor: 1 });
    expect(out.envelopes).toHaveLength(0);
    expect(out.nextCursor).toBe(1);
  });

  test("tst_conn_mockgmail_ts_003 missing file ⇒ empty page, surface defaults to email", async () => {
    const out = await fetchMockGmail({ surface: "" });
    expect(out.envelopes).toHaveLength(0);
    expect(out.nextCursor).toBe(0);
    expect(out.hasMore).toBe(false);
  });

  test("tst_conn_mockgmail_ts_004 malformed lines are skipped, not fatal", async () => {
    writeFileSync(
      process.env.MOCK_INJECT_FILE!,
      `not json\n${JSON.stringify({ surface: "email", payload: { message_id: "ok" }, remote_id: "ok" })}\n`,
    );
    const out = await fetchMockGmail({ surface: "email", cursor: 0 });
    expect(out.envelopes).toHaveLength(1);
    expect(out.envelopes[0]!.payload.message_id).toBe("ok");
  });
});

describe("mock-gmail store", () => {
  test("tst_conn_mockgmail_ts_005 append returns the surface's new total", () => {
    expect(appendItem("email", { message_id: "a" }, "a")).toBe(1);
    expect(appendItem("meetings", { id: "e" }, "gcal:e")).toBe(1); // per-surface count
    expect(appendItem("email", { message_id: "b" }, "b")).toBe(2);
    expect(readItems("email").map((i) => i.remote_id)).toEqual(["a", "b"]);
  });

  test("tst_conn_mockgmail_ts_006 MOCK_INJECT_FILE is required (no fallback)", () => {
    delete process.env.MOCK_INJECT_FILE;
    expect(() => readItems("email")).toThrow(/MOCK_INJECT_FILE/);
  });
});

describe("mock-gmail injection payloads", () => {
  test("tst_conn_mockgmail_ts_007 email payload shape matches the Rust builder", () => {
    const { payload, remoteId } = buildEmail({
      from_address: "b@x",
      subject: "Injected",
      body_text: "via http",
    });
    expect(remoteId).toMatch(/^mock-/);
    expect(payload.message_id).toBe(remoteId);
    expect(payload.from_address).toBe("b@x");
    expect(payload.from_name).toBe(""); // absent ⇒ empty string (unwrap_or_default)
    expect(payload.has_attachments).toBe(false);
    expect(payload.attachments).toEqual([]);
    expect(typeof payload.sent_at).toBe("string");
    expect(payload).not.toHaveProperty("thread_id"); // only set when provided
  });

  test("tst_conn_mockgmail_ts_008 attachments + thread_id + explicit message_id", () => {
    const { payload, remoteId } = buildEmail({
      message_id: "m9",
      thread_id: "t1",
      attachments: [{ filename: "a.pdf", mime_type: "application/pdf", size: 12 }],
    });
    expect(remoteId).toBe("m9");
    expect(payload.thread_id).toBe("t1");
    expect(payload.has_attachments).toBe(true);
    const att = (payload.attachments as Array<Record<string, unknown>>)[0]!;
    expect(att.attachment_id).toMatch(/^att-/);
    expect(att.filename).toBe("a.pdf");
    expect(att.size).toBe(12);
    // Absent optional fields are explicit JSON nulls, as in Rust.
    const bare = buildEmail({ attachments: [{}] }).payload;
    const bareAtt = (bare.attachments as Array<Record<string, unknown>>)[0]!;
    expect(bareAtt.filename).toBeNull();
    expect(bareAtt.mime_type).toBeNull();
    expect(bareAtt.size).toBe(0);
  });

  test("tst_conn_mockgmail_ts_009 event payload + gcal: remote_id", () => {
    const { payload, remoteId } = buildEvent({
      id: "e1",
      title: "Standup",
      starts_at: "2026-05-20T10:00:00Z",
      ends_at: "2026-05-20T10:15:00Z",
      attendees: [{ name: "Ann", email: "a@x" }],
      location: "Room 1",
    });
    expect(remoteId).toBe("gcal:e1");
    expect(payload.id).toBe("e1");
    expect(payload.attendees).toEqual([{ name: "Ann", email: "a@x" }]);
    expect(payload.location).toBe("Room 1");
    expect(payload).not.toHaveProperty("description");
    const auto = buildEvent({});
    expect(auto.remoteId).toMatch(/^gcal:mock-/);
    expect(auto.payload.title).toBeNull();
  });

  test("tst_conn_mockgmail_ts_010 inject → fetch round-trip (the curl demo path)", async () => {
    expect(injectEmail({ from_address: "b@x", subject: "Injected" })).toEqual({
      queued: true,
      total: 1,
    });
    expect(injectEvent({ id: "e1", title: "Standup" })).toEqual({ queued: true, total: 1 });
    const out = await fetchMockGmail({ surface: "email", cursor: 0 });
    expect(out.envelopes).toHaveLength(1);
    expect(out.envelopes[0]!.payload.subject).toBe("Injected");
    const meetings = await fetchMockGmail({ surface: "meetings", cursor: 0 });
    expect(meetings.envelopes[0]!.remote_id).toBe("gcal:e1");
  });
});

describe("mock-gmail http routes", () => {
  test("tst_conn_mockgmail_ts_011 /inject, /inject-event, /health, /status", async () => {
    const post = (path: string, b: unknown) =>
      handleHttp(new Request(`http://x${path}`, { method: "POST", body: JSON.stringify(b) }));

    expect(await (await post("/inject", { subject: "one" })).json()).toEqual({
      queued: true,
      total: 1,
    });
    expect(await (await post("/inject-event", { id: "e1" })).json()).toEqual({
      queued: true,
      total: 1,
    });

    const health = await handleHttp(new Request("http://x/health"));
    expect(await health.text()).toBe("ok");

    const status = await handleHttp(new Request("http://x/status"));
    expect(await status.json()).toEqual({ email: 1, meetings: 1 });

    const missing = await handleHttp(new Request("http://x/nope"));
    expect(missing.status).toBe(404);
  });
});
