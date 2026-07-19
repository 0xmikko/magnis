import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleMessage, type FetchResult } from "@magnis/connector-sdk";
import { buildConnectorConfig } from "../connector";
import { stableContactId } from "../contacts";
import type { FetchLike } from "../http";

const b64url = (s: string) => Buffer.from(s, "utf-8").toString("base64url");

/** Raw-API fixture doc, per the Rust fixture.rs file format. */
const FIXTURE_DOC = {
  messages: [
    {
      id: "m1",
      threadId: "t1",
      labelIds: ["UNREAD", "INBOX"],
      snippet: "Hello preview",
      internalDate: "1700000000000",
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "Subject", value: "Hi" },
          { name: "From", value: "Alice <alice@x.com>" },
          { name: "To", value: "Bob <bob@y.com>" },
        ],
        body: { data: b64url("Hello body") },
      },
    },
    { id: "broken-no-payload" }, // convert fails → skipped, logged
  ],
  events: [
    {
      id: "e1",
      summary: "Standup",
      status: "confirmed",
      start: { dateTime: "2026-05-20T10:00:00Z" },
      end: { dateTime: "2026-05-20T10:15:00Z" },
      attendees: [{ email: "alice@x.com", displayName: "Alice" }],
    },
    { id: "e2", summary: "Ghost", status: "cancelled" }, // dropped
  ],
  connections: [
    {
      resourceName: "people/c12345",
      names: [{ displayName: "Carol", givenName: "Carol" }],
      emailAddresses: [{ value: "carol@x.com" }],
    },
    { resourceName: "people/cEmpty" }, // identity-less → dropped
  ],
};

const noNetwork: FetchLike = async (url) => {
  throw new Error(`fixture mode must not hit the network: ${url}`);
};

function withFixture(doc: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "gts-fixture-"));
  const path = join(dir, "google-fixture.json");
  writeFileSync(path, JSON.stringify(doc));
  process.env.GOOGLE_FIXTURE_FILE = path;
  return path;
}

afterEach(() => {
  delete process.env.GOOGLE_FIXTURE_FILE;
});

/** Drive the REAL wire path: SDK handleMessage → tools/call → connector. */
async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const reply = await handleMessage(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    buildConnectorConfig(noNetwork),
  );
  return reply as Record<string, unknown>;
}

describe("fixture mode end-to-end", () => {
  test("tst_gts_fx_001 email/meetings/contacts served from file, one page, no counters", async () => {
    withFixture(FIXTURE_DOC);

    const email = (await call("magnis.sync.fetch", { surface: "email" }))
      .result as FetchResult;
    expect(email.hasMore).toBe(false);
    expect(email.nextCursor).toBeNull();
    // Fixture pages carry NO total/discovered keys (Rust parity).
    expect("total" in email).toBe(false);
    expect("discovered" in email).toBe(false);
    expect(email.envelopes).toHaveLength(1); // broken message skipped
    const m = email.envelopes[0];
    expect(m.remote_id).toBe("m1");
    expect(m.kind).toBe("snapshot");
    expect(m.payload.from_address).toBe("alice@x.com");
    expect(m.payload.to_addresses).toBe("bob@y.com");
    expect(m.payload.body_text).toBe("Hello body");
    expect(m.payload.is_read).toBe(false);

    const meetings = (await call("magnis.sync.fetch", { surface: "meetings" }))
      .result as FetchResult;
    expect(meetings.envelopes).toHaveLength(1); // cancelled dropped
    expect(meetings.envelopes[0].remote_id).toBe("gcal:e1");
    expect(meetings.envelopes[0].payload.title).toBe("Standup");

    const contacts = (await call("magnis.sync.fetch", { surface: "contacts" }))
      .result as FetchResult;
    expect(contacts.envelopes).toHaveLength(1); // identity-less dropped
    expect(contacts.envelopes[0].remote_id).toBe(
      `gpeople:${stableContactId("people/c12345")}`,
    );
    expect(contacts.envelopes[0].payload.display_name).toBe("Carol");
  });

  test("tst_gts_fx_002 missing arrays → empty envelopes (no crash)", async () => {
    withFixture({ messages: [FIXTURE_DOC.messages[0]] }); // no events/connections
    const meetings = (await call("magnis.sync.fetch", { surface: "meetings" }))
      .result as FetchResult;
    expect(meetings.envelopes).toEqual([]);
    expect(meetings.hasMore).toBe(false);
  });

  test("tst_gts_fx_003 execute is recorded/echoed, never sent", async () => {
    withFixture(FIXTURE_DOC);

    const send = (await call("magnis.execute", {
      action: "send_message",
      draft: { to: [{ address: "b@x.com" }], subject: "s", body_text: "t" },
    })).result as Record<string, unknown>;
    expect(send.message_id).toMatch(/^fixture-[0-9a-f-]{36}$/);
    expect(send.thread_id).toBeNull();
    expect(send.recorded).toBe(true);
    expect(send.action).toBe("send_message");

    const dl = (await call("magnis.execute", {
      action: "download_file",
      source_ref: { message_id: "m1", attachment_id: "a1" },
      dest: "/tmp/never-written.bin",
    })).result as Record<string, unknown>;
    expect(dl).toEqual({
      local_path: "/tmp/never-written.bin",
      size_bytes: 0,
      recorded: true,
      action: "download_file",
    });

    // Unknown actions are echoed too (fixture mode records everything).
    const other = (await call("magnis.execute", { action: "weird_thing" }))
      .result as Record<string, unknown>;
    expect(other).toEqual({ recorded: true, action: "weird_thing" });
  });
});

describe("live-mode wire errors (no fixture)", () => {
  test("tst_gts_wire_004 missing _meta / missing credential key", async () => {
    const noMeta = await call("magnis.sync.fetch", { surface: "email" });
    expect((noMeta.error as Record<string, unknown>).message).toBe(
      "missing _meta with Google credentials",
    );

    const partial = await call("magnis.sync.fetch", {
      surface: "email",
      _meta: { refresh_token: "rt", client_id: "cid" },
    });
    expect((partial.error as Record<string, unknown>).message).toBe(
      "missing credential 'client_secret' in _meta",
    );
  });

  test("tst_gts_wire_005 unknown surface + unknown execute action", async () => {
    // Token refresh succeeds, then the surface dispatch rejects.
    const withToken: FetchLike = async (url) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => "{}",
          json: async () => ({ access_token: "at" }),
        };
      }
      throw new Error(`unexpected url ${url}`);
    };
    const reply = (await handleMessage(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "magnis.sync.fetch",
          arguments: {
            surface: "bogus",
            _meta: { refresh_token: "r", client_id: "c", client_secret: "s" },
          },
        },
      },
      buildConnectorConfig(withToken),
    )) as Record<string, unknown>;
    expect((reply.error as Record<string, unknown>).message).toBe(
      "unknown surface 'bogus'",
    );

    const unknownAction = await call("magnis.execute", { action: "weird_thing" });
    expect((unknownAction.error as Record<string, unknown>).message).toBe(
      "Unknown gmail execute action: weird_thing",
    );
  });

  test("tst_gts_wire_006 429 maps to typed -32002 with retry_after (SDK contract)", async () => {
    const rateLimited: FetchLike = async (url) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => "{}",
          json: async () => ({ access_token: "at" }),
        };
      }
      return {
        ok: false,
        status: 429,
        headers: { get: (n: string) => (n === "retry-after" ? "45" : null) },
        text: async () => "",
        json: async () => ({}),
      };
    };
    const reply = (await handleMessage(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "magnis.sync.fetch",
          arguments: {
            surface: "email",
            _meta: { refresh_token: "r", client_id: "c", client_secret: "s" },
          },
        },
      },
      buildConnectorConfig(rateLimited),
    )) as Record<string, unknown>;
    const error = reply.error as Record<string, unknown>;
    expect(error.code).toBe(-32002);
    expect((error.data as Record<string, unknown>).retry_after).toBe(45);
    expect(error.message).toBe("Google rate limited: retry after 45s");
  });

  // The Rust twin passes the FULL tools/call args to `fetch_events_page`
  // (main.rs:206), which reads `time_min`/`time_max` off them
  // (calendar.rs:125-135) to override the default now-30d..now+90d window.
  // The host does not send a window today, so this is dormant — but a silently
  // ignored window would activate as a real divergence the day it does.
  test("tst_gts_wire_007 calendar time_min/time_max window reaches the API", async () => {
    let calendarUrl = "";
    const capture: FetchLike = async (url) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => "{}",
          json: async () => ({ access_token: "at" }),
        };
      }
      calendarUrl = url;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => "{}",
        json: async () => ({ items: [] }),
      };
    };

    const meta = { refresh_token: "r", client_id: "c", client_secret: "s" };
    await handleMessage(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "magnis.sync.fetch",
          arguments: {
            surface: "meetings",
            time_min: "2026-01-01T00:00:00Z",
            time_max: "2026-02-01T00:00:00Z",
            _meta: meta,
          },
        },
      },
      buildConnectorConfig(capture),
    );
    expect(calendarUrl).toContain("timeMin=2026-01-01T00%3A00%3A00Z");
    expect(calendarUrl).toContain("timeMax=2026-02-01T00%3A00%3A00Z");

    // No window sent → the default window still applies (Rust: unwrap_or_else).
    calendarUrl = "";
    await handleMessage(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "magnis.sync.fetch",
          arguments: { surface: "meetings", _meta: meta },
        },
      },
      buildConnectorConfig(capture),
    );
    expect(calendarUrl).toContain("timeMin=");
    expect(calendarUrl).toContain("timeMax=");
  });
});
