// google connector — the standard @magnis/testkit/source wire contract, driven
// through the SDK `handleMessage` against the REAL buildConnectorConfig. Live
// mode (no fixture env), with a mockFetch answering the OAuth token endpoint +
// each surface's Google REST endpoints — NO network. Proves: initialize
// advertises the three surfaces; a full paginated drain per surface (contacts
// walks TWO People-API pages via nextPageToken); the execute table sends; and an
// upstream 429 signals as the typed -32002 + retry_after.
//
// The connector's OWN unit + serde tests (gmail/calendar/contacts.test.ts,
// serde-parity.test.ts) pin the per-fetcher conversion; the fixture.test.ts pins
// replay mode. This file adds ONLY the reusable wire-contract layer.
import { describe, expect, test } from "bun:test";
import { mockFetch, runSourceContract, type CannedResponse } from "@magnis/testkit/source";
import { buildConnectorConfig } from "../connector";
import type { ImapMailbox } from "../surfaces/email/imap";

const META = { refresh_token: "r", client_id: "c", client_secret: "s" };
const b64url = (s: string) => Buffer.from(s, "utf-8").toString("base64url");

const TOKEN: CannedResponse = { body: { access_token: "at", expires_in: 3600 } };

/** A well-formed Gmail `messages.get` body (mirrors serde-parity's fullMessage). */
const fullMessage = {
  id: "m1",
  threadId: "t1",
  labelIds: ["INBOX"],
  snippet: "Hi",
  internalDate: "1700000000000",
  payload: {
    mimeType: "text/plain",
    headers: [{ name: "Subject", value: "Hi" }],
    body: { size: 5, data: b64url("Hello") },
  },
};

// Routes shared by the happy-path drain + execute. Order matters — the first
// matching route answers, so the specific Gmail paths precede the list path.
function happyRoutes() {
  return [
    { match: "oauth2.googleapis.com/token", response: TOKEN },
    { match: "/users/me/profile", response: { body: { emailAddress: "user@example.com", historyId: "555", messagesTotal: 1 } } },
    { match: "/users/me/labels/SPAM", response: { body: { id: "SPAM", messagesTotal: 0 } } },
    { match: "/users/me/labels/TRASH", response: { body: { id: "TRASH", messagesTotal: 0 } } },
    { match: "/messages/send", response: { body: { id: "sent1", threadId: "t1" } } },
    { match: "/messages/m1?format=full", response: { body: fullMessage } },
    { match: "/users/me/messages?", response: { body: { messages: [{ id: "m1" }] } } },
    {
      match: "/calendar/v3/calendars/primary/events",
      response: {
        body: {
          items: [
            {
              id: "e1",
              summary: "Standup",
              status: "confirmed",
              start: { dateTime: "2026-05-20T10:00:00Z" },
              end: { dateTime: "2026-05-20T10:15:00Z" },
            },
          ],
          nextSyncToken: "calendar-sync-1",
        },
      },
    },
    {
      // People connections: TWO pages — page 1 hands back a nextPageToken, so
      // the drain feeds it as the cursor and pulls page 2 (which has none).
      match: "/people/me/connections",
      response: [
        {
          body: {
            connections: [{ resourceName: "people/c1", emailAddresses: [{ value: "a@b.c" }] }],
            nextPageToken: "pg2",
            totalItems: 2,
          },
        },
        {
          body: {
            connections: [{ resourceName: "people/c2", emailAddresses: [{ value: "b@b.c" }] }],
            totalItems: 2,
            nextSyncToken: "people-sync-1",
          },
        },
      ],
    },
  ];
}

const openImap = async (): Promise<ImapMailbox> => ({
  uidValidity: "42",
  searchBelow: async () => [9],
  fetch: async function* () {
    yield {
      uid: 9,
      emailId: "12345",
      threadId: "54321",
      flags: new Set<string>(),
      labels: new Set<string>(),
      internalDate: new Date("2026-09-24T10:00:00Z"),
      source: Buffer.from("Subject: Hi\r\nContent-Type: text/plain\r\n\r\nHello"),
    };
  },
  close: async () => {},
});

// The contract runs on bun:test (the testkit's own runner); the describe
// names the lane for the scoped pre-commit verification.
describe("google", () => runSourceContract(buildConnectorConfig(mockFetch(happyRoutes()), openImap), {
  fetch: {
    // The mailbox envelope precedes the one message: two envelopes, no counters.
    email: { meta: META, minEnvelopes: 2 },
    // The calendar envelope precedes the one event: two envelopes, no counters.
    meetings: { meta: META, minEnvelopes: 2 },
    // The list envelope precedes the two persons: three envelopes, no counters.
    contacts: { meta: META, minEnvelopes: 3 },
  },
  execute: [
    {
      action: "send_message",
      args: { draft: { to: [{ address: "b@x.com" }], subject: "s", body_text: "t" } },
      meta: META,
      assert: (r) => {
        if (r.message_id !== "sent1") throw new Error(`expected message_id sent1, got ${String(r.message_id)}`);
      },
    },
  ],
  rateLimit: {
    config: buildConnectorConfig(
      mockFetch([
        { match: "oauth2.googleapis.com/token", response: TOKEN },
        {
          match: "/people/me/connections",
          response: { status: 429, headers: { "retry-after": "30" } },
        },
      ]),
    ),
    surface: "contacts",
    meta: META,
    retryAfter: 30,
  },
}));

/**
 * @test-id: tst_src_iso_google_012
 * @scenario: scn_google_pull_002
 * @covers: sources/google/src/connector.ts::buildConnectorConfig
 * @deterministic: yes
 * @fixtures: scripted terminal Calendar page with a retained provider token
 */
test("tst_src_iso_google_012 terminal Calendar token does not mean another page", async () => {
  const source = buildConnectorConfig(mockFetch(happyRoutes()));
  const result = await source.fetch({ surface: "meetings", meta: META });
  expect(result.nextCursor).toEqual({ sync_token: "calendar-sync-1" });
  expect(result.hasMore).toBe(false);
});
