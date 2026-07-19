// Serde-parity: the TS connector must reject EXACTLY what the Rust twin's
// serde rejects, and accept exactly what it accepts.
//
// The Rust connector (plugins/sources/google/src/{gmail,calendar,contacts}.rs)
// deserializes every provider response into a struct. A field typed `T` is
// required — a body missing it fails `response.json()` with a serde error,
// which becomes `GoogleSyncError::Other(..)`. Where that error surfaces is
// NOT uniform, and this file pins both halves:
//
//   * `messages.get` (fetch_message) → `Other` is caught by
//     `snapshot_envelopes_from_fetched` and SKIPS that one message.
//   * every other call (profile / list / history / calendar / people) →
//     `Other` propagates out of the fetch and FAILS THE WHOLE SURFACE.
//
// The mirror-image risk is over-tightening: a field that is `Option<T>` or
// `#[serde(default)]` in Rust MUST stay tolerant here, or we would error
// surfaces the Rust happily syncs. The "tolerated" tests below pin that.

import { describe, expect, test } from "bun:test";
import {
  fetchHistoryChanges,
  fetchMessagePage,
  sendMessage,
} from "../surfaces/email/gmail";
import { fetchEventsPage } from "../surfaces/meetings/calendar";
import { fetchContactsPage } from "../surfaces/contacts/contacts";
import type { FetchLike, HttpResponse } from "../http";

function ok(data: unknown): HttpResponse {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(data),
    json: async () => data,
  };
}

const b64url = (s: string) => Buffer.from(s, "utf-8").toString("base64url");

/** A well-formed `messages.get` body (every required field present). */
function fullMessage(id = "msg_1"): Record<string, unknown> {
  return {
    id,
    threadId: "thread_1",
    labelIds: ["INBOX"],
    snippet: "Hello preview",
    internalDate: "1700000000000",
    payload: {
      mimeType: "text/plain",
      headers: [{ name: "Subject", value: "Test subject" }],
      body: { size: 11, data: b64url("Hello world") },
    },
  };
}

/** Route a Gmail bootstrap page: profile + messages list + per-id get. */
function gmailRoutes(opts: {
  profile?: unknown;
  list?: unknown;
  messages?: Record<string, unknown>;
}): FetchLike {
  return async (url) => {
    if (url.includes("/users/me/profile")) {
      return ok(opts.profile ?? { historyId: "555", messagesTotal: 10 });
    }
    if (url.includes("/users/me/messages?")) {
      return ok(opts.list ?? { messages: [{ id: "msg_1" }] });
    }
    const m = url.match(/\/messages\/([^?]+)\?format=full/);
    if (m) {
      const body = opts.messages?.[m[1]];
      if (body === undefined) throw new Error(`unexpected message id ${m[1]}`);
      return ok(body);
    }
    throw new Error(`unexpected url ${url}`);
  };
}

// ── Gmail: whole-fetch failures ─────────────────────────────────────────────

describe("serde parity — gmail required fields", () => {
  // GmailProfile.history_id: String (gmail.rs:95) — required, no default.
  // Missing → Rust `get_profile()` errors → fetch_message_page propagates →
  // the whole email surface fails. TS must NOT leave the cursor without a
  // history_id (which silently forces the NEXT forward call to HistoryExpired
  // → a full host re-bootstrap).
  test("tst_gts_serde_001 profile without historyId fails the fetch", async () => {
    const fetchFn = gmailRoutes({
      profile: { emailAddress: "me@example.com", messagesTotal: 10 },
      messages: { msg_1: fullMessage() },
    });
    await expect(fetchMessagePage("tok", undefined, fetchFn)).rejects.toThrow(
      /missing field `historyId`/,
    );
  });

  // GmailMessageRef.id: String (gmail.rs:40) — required, no default. Missing →
  // Rust `list_messages_page()` errors → whole surface fails. TS must not fetch
  // `/messages/undefined`.
  test("tst_gts_serde_002 messages list entry without id fails the fetch", async () => {
    const fetchFn = gmailRoutes({
      list: { messages: [{ threadId: "t1" }] },
      messages: { msg_1: fullMessage() },
    });
    await expect(fetchMessagePage("tok", undefined, fetchFn)).rejects.toThrow(
      /missing field `id`/,
    );
  });

  // HistoryListResponse.history_id: String (gmail.rs:109) — required, no
  // default. Missing → Rust `list_history()` errors → whole surface fails.
  test("tst_gts_serde_003 history response without historyId fails the fetch", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.includes("/history?")) return ok({ history: [] });
      throw new Error(`unexpected url ${url}`);
    };
    await expect(
      fetchHistoryChanges("tok", { history_id: "100" }, fetchFn),
    ).rejects.toThrow(/missing field `historyId`/);
  });

  // HistoryMessageRef.id: String (gmail.rs:142) — required, no default.
  // Missing → the HistoryListResponse deserialize fails as a whole → Rust
  // errors the surface. TS must not emit an envelope with remote_id undefined.
  test("tst_gts_serde_004 history message ref without id fails the fetch", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.includes("/history?")) {
        return ok({
          history: [{ messagesAdded: [{ message: { threadId: "t" } }] }],
          historyId: "999",
        });
      }
      throw new Error(`unexpected url ${url}`);
    };
    await expect(
      fetchHistoryChanges("tok", { history_id: "100" }, fetchFn),
    ).rejects.toThrow(/missing field `id`/);
  });

  // HistoryMessageEvent.message: HistoryMessageRef (gmail.rs:127) — required.
  test("tst_gts_serde_005 history event without message fails the fetch", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.includes("/history?")) {
        return ok({ history: [{ messagesDeleted: [{}] }], historyId: "999" });
      }
      throw new Error(`unexpected url ${url}`);
    };
    await expect(
      fetchHistoryChanges("tok", { history_id: "100" }, fetchFn),
    ).rejects.toThrow(/missing field `message`/);
  });

  // SendResponse.id: String (gmail.rs:348) — required, no default. Missing →
  // Rust errors the execute call rather than returning message_id: null.
  test("tst_gts_serde_006 send response without id fails the send", async () => {
    const fetchFn: FetchLike = async () => ok({ threadId: "t1" });
    await expect(
      sendMessage(
        "tok",
        {
          to: [{ name: null, address: "a@b.c" }],
          cc: [],
          bcc: [],
          subject: "s",
          body_text: "b",
          body_html: null,
          in_reply_to: null,
          attachments: [],
        },
        fetchFn,
      ),
    ).rejects.toThrow(/missing field `id`/);
  });
});

// ── Gmail: per-message skip (NOT a whole-fetch failure) ─────────────────────

describe("serde parity — gmail messages.get skips one message", () => {
  // GmailMessage.id: String (gmail.rs:45) — required. A malformed
  // `messages.get` body is `Other` inside `fetch_snapshot_envelopes`, which
  // `snapshot_envelopes_from_fetched` SKIPS (gmail.rs:544) — the page still
  // succeeds with the remaining messages.
  test("tst_gts_serde_007 messages.get without id skips that message only", async () => {
    const fetchFn = gmailRoutes({
      list: { messages: [{ id: "bad" }, { id: "good" }] },
      messages: {
        bad: { threadId: "t", payload: { mimeType: "text/plain" } },
        good: fullMessage("good"),
      },
    });
    const r = await fetchMessagePage("tok", undefined, fetchFn);
    expect(r.envelopes).toHaveLength(1);
    expect(r.envelopes[0].remote_id).toBe("good");
  });

  // GmailHeader.name/value: String (gmail.rs:64-65) — both required. A header
  // object missing `value` fails the messages.get deserialize in Rust → that
  // one message is skipped (NOT silently converted with an empty subject).
  test("tst_gts_serde_008 header without value skips that message only", async () => {
    const bad = fullMessage("bad");
    (bad.payload as Record<string, unknown>).headers = [{ name: "Subject" }];
    const fetchFn = gmailRoutes({
      list: { messages: [{ id: "bad" }, { id: "good" }] },
      messages: { bad, good: fullMessage("good") },
    });
    const r = await fetchMessagePage("tok", undefined, fetchFn);
    expect(r.envelopes).toHaveLength(1);
    expect(r.envelopes[0].remote_id).toBe("good");
  });
});

// ── Calendar / Contacts: whole-fetch failures ───────────────────────────────

describe("serde parity — calendar + contacts required fields", () => {
  // GcalEvent.id: String (calendar.rs:29) — required, no default. Missing →
  // Rust `list_events_page()` errors → whole meetings surface fails. TS must
  // not emit remote_id "gcal:undefined".
  test("tst_gts_serde_009 calendar item without id fails the fetch", async () => {
    const fetchFn: FetchLike = async () =>
      ok({ items: [{ summary: "No id here" }] });
    await expect(fetchEventsPage("tok", undefined, {}, fetchFn)).rejects.toThrow(
      /missing field `id`/,
    );
  });

  // GpeoplePerson.resource_name: String (contacts.rs:31) — required, no
  // default. Missing → Rust `list_connections_page()` errors → whole contacts
  // surface fails. Note the person below has NO identity, so the unfixed TS
  // drops it silently before ever hashing the (undefined) resourceName.
  test("tst_gts_serde_010 person without resourceName fails the fetch", async () => {
    const fetchFn: FetchLike = async () =>
      ok({ connections: [{ organizations: [{ name: "Acme" }] }] });
    await expect(fetchContactsPage("tok", undefined, fetchFn)).rejects.toThrow(
      /missing field `resourceName`/,
    );
  });
});

// ── Anti-over-tightening: what Rust TOLERATES must stay tolerated ───────────

describe("serde parity — optional/default fields stay tolerant", () => {
  // GmailProfile.messages_total: #[serde(default)] Option<u64> (gmail.rs:99).
  // ListMessagesResponse.messages / next_page_token: Option<_> (gmail.rs:33).
  // GmailMessage: everything but `id` is Option<_> (gmail.rs:44).
  test("tst_gts_serde_011 gmail tolerates every optional field being absent", async () => {
    const fetchFn = gmailRoutes({
      profile: { historyId: "555" }, // no messagesTotal
      list: { messages: [{ id: "bare" }] }, // no nextPageToken
      messages: { bare: { id: "bare", payload: {} } }, // id + payload only
    });
    const r = await fetchMessagePage("tok", undefined, fetchFn);
    expect(r.total).toBeNull(); // indeterminate, not an error
    expect(r.envelopes).toHaveLength(1);
    expect(r.hasMore).toBe(false);
    expect(r.nextCursor.history_id).toBe("555");
  });

  // ListMessagesResponse.messages: Option<Vec<_>> — an ENTIRELY absent list
  // (Gmail omits `messages` on an empty mailbox) is not an error.
  test("tst_gts_serde_012 gmail tolerates a list page with no messages key", async () => {
    const fetchFn = gmailRoutes({ profile: { historyId: "1" }, list: {} });
    const r = await fetchMessagePage("tok", undefined, fetchFn);
    expect(r.envelopes).toHaveLength(0);
  });

  // HistoryListResponse.history: #[serde(default)] Vec<_> (gmail.rs:107) —
  // absent means "no changes", not an error. HistoryEntry's four event lists
  // are all #[serde(default)] too, and HistoryMessageRef.thread_id is Option.
  test("tst_gts_serde_013 history tolerates absent history + partial entries", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.includes("/history?")) return ok({ historyId: "999" });
      throw new Error(`unexpected url ${url}`);
    };
    const r = await fetchHistoryChanges("tok", { history_id: "100" }, fetchFn);
    expect(r.envelopes).toHaveLength(0);
    expect(r.nextCursor).toEqual({ history_id: "999", discovered: 0 });
  });

  // Only `HistoryLabelEvent` declares `label_ids` (gmail.rs:136);
  // `HistoryMessageEvent` (messagesAdded/Deleted) does NOT, so serde treats a
  // `labelIds` there as an ignorable unknown field rather than validating it.
  // Validating it everywhere would reject a body the Rust accepts.
  test("tst_gts_serde_016 labelIds is ignored on messagesAdded, typed on labelsAdded", async () => {
    const withLabels = (entry: unknown): FetchLike => async (url) => {
      if (url.includes("/history?")) return ok({ history: [entry], historyId: "9" });
      if (url.includes("/messages/mA?format=full")) return ok(fullMessage("mA"));
      throw new Error(`unexpected url ${url}`);
    };

    // Ignored (not a sequence) on messagesAdded → tolerated, like serde.
    const r = await fetchHistoryChanges(
      "tok",
      { history_id: "100" },
      withLabels({ messagesAdded: [{ message: { id: "mA" }, labelIds: null }] }),
    );
    expect(r.envelopes).toHaveLength(1);

    // Typed on labelsAdded → a non-sequence is a hard error, like serde.
    await expect(
      fetchHistoryChanges(
        "tok",
        { history_id: "100" },
        withLabels({ labelsAdded: [{ message: { id: "mA" }, labelIds: "INBOX" }] }),
      ),
    ).rejects.toThrow(/invalid type for `labelIds`/);
  });

  // GcalEvent: everything but `id` is Option<_> (calendar.rs:28); GcalDateTime
  // and GcalAttendee are all-Option. A bare event still converts.
  test("tst_gts_serde_014 calendar tolerates a bare event + absent items", async () => {
    const bare: FetchLike = async () => ok({ items: [{ id: "evt_1" }] });
    const r = await fetchEventsPage("tok", undefined, {}, bare);
    expect(r.envelopes).toHaveLength(1);
    expect(r.envelopes[0].payload.title).toBe("Untitled Event");

    const empty: FetchLike = async () => ok({});
    expect((await fetchEventsPage("tok", undefined, {}, empty)).envelopes).toHaveLength(0);
  });

  // GpeopleConnectionsResponse.connections + every GpeoplePerson sub-list are
  // #[serde(default)] Vec<_> (contacts.rs:22,33-43); GpeopleMetadata.primary is
  // #[serde(default)] bool (contacts.rs:105). A person with only a resourceName
  // + one email must still convert.
  test("tst_gts_serde_015 contacts tolerates absent lists + metadata", async () => {
    const fetchFn: FetchLike = async () =>
      ok({
        connections: [
          { resourceName: "people/c1", emailAddresses: [{ value: "a@b.c" }] },
        ],
      });
    const r = await fetchContactsPage("tok", undefined, fetchFn);
    expect(r.envelopes).toHaveLength(1);
    expect(r.envelopes[0].payload.display_name).toBeNull();
    expect((r.envelopes[0].payload.emails as unknown[])).toHaveLength(1);

    const empty: FetchLike = async () => ok({});
    expect((await fetchContactsPage("tok", undefined, empty)).envelopes).toHaveLength(0);
  });
});
