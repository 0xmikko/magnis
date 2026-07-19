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
import { mockFetch, runSourceContract, type CannedResponse } from "@magnis/testkit/source";
import { buildConnectorConfig } from "../connector";

const META = { refresh_token: "r", client_id: "c", client_secret: "s" };
const b64url = (s: string) => Buffer.from(s, "utf-8").toString("base64url");

const TOKEN: CannedResponse = { body: { access_token: "at" } };

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
    { match: "/users/me/profile", response: { body: { historyId: "555", messagesTotal: 1 } } },
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
            totalPeople: 2,
          },
        },
        {
          body: {
            connections: [{ resourceName: "people/c2", emailAddresses: [{ value: "b@b.c" }] }],
            totalPeople: 2,
          },
        },
      ],
    },
  ];
}

runSourceContract(buildConnectorConfig(mockFetch(happyRoutes())), {
  fetch: {
    email: { meta: META, minEnvelopes: 1, expectCounters: ["total", "discovered"] },
    meetings: { meta: META, minEnvelopes: 1, expectCounters: "discovered" },
    contacts: { meta: META, minEnvelopes: 2, expectCounters: "discovered" },
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
});
