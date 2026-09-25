import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { CURSOR_EXPIRED_CODE, handleMessage } from "@magnis/connector-sdk";
import {
  fetchContactsPage,
  gpeoplePersonToContact,
  stableContactId,
  type GpeoplePerson,
} from "./contacts";
import type { FetchLike, HttpResponse } from "../../http";

function ok(data: unknown): HttpResponse {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(data),
    json: async () => data,
  };
}

function status(code: number, body = ""): HttpResponse {
  return {
    ok: false,
    status: code,
    headers: { get: () => null },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

/** The VERBATIM body the live People API returned when the overnight-stale
 * pageToken was replayed (real google connector, real account). */
const FAILED_PRECONDITION_BODY = JSON.stringify({
  error: {
    code: 400,
    message: "Precondition check failed.",
    status: "FAILED_PRECONDITION",
  },
});

function fullPerson(): GpeoplePerson {
  return {
    resourceName: "people/c12345",
    etag: "%EgU0Aj0BNw==",
    names: [
      {
        displayName: "Mikhail Lazarev",
        givenName: "Mikhail",
        familyName: "Lazarev",
        metadata: { primary: true },
      },
    ],
    emailAddresses: [
      { value: "mikhail@example.com", type: "work", metadata: { primary: true } },
    ],
    phoneNumbers: [
      {
        value: "+49 30 1234567",
        canonicalForm: "+4930 1234567",
        type: "mobile",
        metadata: { primary: true },
      },
    ],
    organizations: [{ name: "Acme", title: "Engineer", current: true }],
    photos: [],
    urls: [],
  };
}

describe("people → contact conversion", () => {
  test("tst_gts_gp_001 full person converts; id = sha256 hex first 16", () => {
    const c = gpeoplePersonToContact(fullPerson())!;
    expect(c.display_name).toBe("Mikhail Lazarev");
    expect(c.given_name).toBe("Mikhail");
    expect(c.family_name).toBe("Lazarev");
    expect(c.emails).toEqual([
      { address: "mikhail@example.com", label: "work", is_primary: true },
    ]);
    const phone0 = c.phones[0];
    if (phone0 === undefined) throw new Error("contact: missing phone 0");
    expect(phone0.number).toBe("+4930 1234567"); // canonicalForm wins
    expect(c.organizations).toEqual([
      { name: "Acme", title: "Engineer", is_current: true },
    ]);
    // Stable id: EXACT sha256("people/c12345") hex prefix, 16 chars.
    const expected = createHash("sha256")
      .update("people/c12345")
      .digest("hex")
      .slice(0, 16);
    expect(c.id).toBe(expected);
    expect(stableContactId("people/c12345")).toBe(expected);
    // Deterministic across calls.
    expect(gpeoplePersonToContact(fullPerson())!.id).toBe(c.id);
    // S3: resourceName + etag ride the payload VERBATIM — the replica's
    // dictionary and the write-back base are built from them; the hashed id
    // stays (the legacy probe reproduces old anchors from it).
    expect(c.resource_name).toBe("people/c12345");
    expect(c.etag).toBe("%EgU0Aj0BNw==");
  });

  test("tst_gts_gp_001b a person without an etag carries null, never a fake", () => {
    const p = fullPerson();
    delete (p as { etag?: string }).etag;
    expect(gpeoplePersonToContact(p)!.etag).toBeNull();
  });

  test("tst_gts_gp_002 display_name falls back to given/family combos", () => {
    const p = fullPerson();
    const name0 = p.names?.[0];
    if (name0 === undefined) throw new Error("person: missing name 0");
    name0.displayName = null;
    expect(gpeoplePersonToContact(p)!.display_name).toBe("Mikhail Lazarev");
    name0.familyName = null;
    expect(gpeoplePersonToContact(p)!.display_name).toBe("Mikhail");
    name0.givenName = null;
    name0.familyName = "Lazarev";
    expect(gpeoplePersonToContact(p)!.display_name).toBe("Lazarev");
  });

  test("tst_gts_gp_003 skip rule: identity-less dropped, email-only kept", () => {
    // No name AND no email AND no phone → skipped (orgs don't count).
    expect(
      gpeoplePersonToContact({
        resourceName: "people/c000",
        organizations: [{ name: "Org with no identity" }],
      }),
    ).toBeNull();

    // Email-only → kept.
    const c = gpeoplePersonToContact({
      resourceName: "people/c999",
      emailAddresses: [{ value: "nobody@example.com" }],
    })!;
    expect(c.display_name).toBeNull();
    expect(c.emails).toEqual([
      { address: "nobody@example.com", label: null, is_primary: false },
    ]);
  });

  test("tst_gts_gp_004 primary selection + profile url case-insensitive", () => {
    const p = fullPerson();
    // Primary name is NOT first → still picked.
    p.names = [
      { displayName: "Wrong", metadata: { primary: false } },
      { displayName: "Right Name", givenName: "Right", metadata: { primary: true } },
    ];
    // No primary photo → first wins.
    p.photos = [{ url: "https://img/one" }, { url: "https://img/two" }];
    p.urls = [
      { value: "https://blog", type: "blog" },
      { value: "https://profile-url", type: "PROFILE" },
    ];
    const c = gpeoplePersonToContact(p)!;
    expect(c.display_name).toBe("Right Name");
    expect(c.photo_url).toBe("https://img/one");
    expect(c.external_url).toBe("https://profile-url");
    // Phone falls back to raw value when canonicalForm is absent.
    p.phoneNumbers = [{ value: "030 111" }];
    const phone0 = gpeoplePersonToContact(p)!.phones[0];
    if (phone0 === undefined) throw new Error("contact: missing phone 0");
    expect(phone0.number).toBe("030 111");
  });
});

describe("contacts fetch", () => {
  /** @test-id: tst_src_iso_google_007
   * @scenario: scn_google_pull_003
   * @covers: sources/google/src/surfaces/contacts/contacts.ts::fetchContactsPage
   * @deterministic: yes
   * @fixtures: two connection pages, totalItems 3, one identity-less person, terminal sync token
   */
  test("tst_src_iso_google_007 full People pass retains a token and states totalItems", async () => {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      calls.push(url);
      if (url.includes("pageToken=p2")) {
        return ok({
          connections: [
            { ...fullPerson(), resourceName: "people/c2" },
            { resourceName: "people/cEmpty" }, // skipped: no identity
          ],
          totalItems: 3,
          nextSyncToken: "people-sync-1",
        });
      }
      return ok({ connections: [fullPerson()], nextPageToken: "p2", totalItems: 3 });
    };

    const p1 = await fetchContactsPage("tok", undefined, fetchFn);
    // The list envelope precedes the persons: what the People API counts.
    expect(p1.envelopes.map((e) => e.remote_id)).toEqual(["list", `gpeople:${stableContactId("people/c12345")}`]);
    expect(p1.envelopes[0]).toEqual({ surface: "contacts", kind: "snapshot", remote_id: "list", payload: { entity_type: "list", total_people: 3 } });
    const env0 = p1.envelopes[1];
    if (env0 === undefined) throw new Error("contacts page: missing envelope 1");
    expect(env0.surface).toBe("contacts");
    expect(env0.kind).toBe("snapshot");
    expect(p1.nextCursor).toEqual({ page_token: "p2" });
    expect(p1.hasMore).toBe(true);
    expect("discovered" in p1).toBe(false);

    const call0 = calls[0];
    if (call0 === undefined) throw new Error("contacts fetch: missing call 0");
    const url = new URL(call0);
    expect(url.pathname).toBe("/v1/people/me/connections");
    expect(url.searchParams.get("personFields")).toBe(
      "names,emailAddresses,phoneNumbers,organizations,photos,urls",
    );
    expect(url.searchParams.get("pageSize")).toBe("1000");
    expect(url.searchParams.get("requestSyncToken")).toBe("true");

    const p2 = await fetchContactsPage("tok", p1.nextCursor, fetchFn);
    // A later page states no count again, but names the persons it left out
    // (no identity) so the plan's skipped meets the total.
    expect(p2.envelopes.map((e) => e.remote_id)).toEqual(["list", `gpeople:${stableContactId("people/c2")}`]);
    expect(p2.envelopes[0]?.payload).toEqual({ entity_type: "list", skipped: 1 });
    expect(p2.nextCursor).toEqual({ sync_token: "people-sync-1" });
    expect(p2.hasMore).toBe(false);
    expect("discovered" in p2).toBe(false);
    await expect(fetchContactsPage("tok", undefined, async () => ok({ connections: [] })))
      .rejects.toThrow("nextSyncToken");
  });

  /**
   * @test-id: tst_src_iso_google_008
   * @scenario: scn_google_pull_003
   * @covers: sources/google/src/surfaces/contacts/contacts.ts::fetchContactsPage
   * @deterministic: yes
   * @fixtures: token poll with provider deletion and identity-less update, then expired token
   */
  test("tst_src_iso_google_008 People delta deletes anchored replicas and expires the token", async () => {
    let requested = "";
    const result = await fetchContactsPage("tok", { sync_token: "people-sync-1" }, async (url) => {
      requested = url;
      return ok({
        connections: [
          { resourceName: "people/deleted", metadata: { deleted: true } },
          { resourceName: "people/identity-lost" },
          fullPerson(),
        ],
        nextSyncToken: "people-sync-2",
      });
    });
    expect(new URL(requested).searchParams.get("syncToken")).toBe("people-sync-1");
    expect(new URL(requested).searchParams.has("requestSyncToken")).toBe(false);
    expect(result.envelopes.map((e) => [e.kind, e.remote_id])).toEqual([
      ["delete", `gpeople:${stableContactId("people/deleted")}`],
      ["delete", `gpeople:${stableContactId("people/identity-lost")}`],
      ["snapshot", `gpeople:${stableContactId("people/c12345")}`],
    ]);
    expect(result.nextCursor).toEqual({ sync_token: "people-sync-2" });
    expect(result.hasMore).toBe(false);
    await expect(fetchContactsPage("tok", { sync_token: "expired" }, async () => status(400, FAILED_PRECONDITION_BODY)))
      .rejects.toThrow("syncToken expired");
  });
});

// ── Stale pagination cursor (the live overnight failure) ────────────────────
//
// A contacts sync parked at `state=failed` after sitting idle overnight: the
// persisted `page_token` had expired, and the replay drew a 400
// FAILED_PRECONDITION that landed on the generic -32000 — terminal.
// Mirrors tst_gts_hist_008b: drive the real body through `fetchFn` and assert
// the code that actually reaches the host wire.

describe("contacts cursor expiry", () => {
  test("tst_gts_gp_006 stale page_token 400 FAILED_PRECONDITION reaches the host wire as -32003", async () => {
    const expired: FetchLike = async () => status(400, FAILED_PRECONDITION_BODY);
    const reply = await handleMessage(
      {
        id: 1,
        method: "tools/call",
        params: { name: "magnis.sync.fetch", arguments: { surface: "contacts" } },
      },
      {
        name: "google",
        version: "0.0.1",
        surfaces: ["contacts"],
        fetch: async () =>
          (await fetchContactsPage(
            "tok",
            { page_token: "GiIKHgjIAWoLCNXu49IGEPir2BFyDAjM7uPSBhDwqcHRAxAC", discovered: 200 },
            expired,
          )) as never,
      },
    );
    const err = reply!.error as Record<string, unknown>;
    expect(err.code).toBe(CURSOR_EXPIRED_CODE);
    expect(err.code).toBe(-32003);
    expect(err.message).toBe("Google contacts pageToken expired (400 FAILED_PRECONDITION)");
  });

  // The inverse, and the reason the mapping is gated on a token being SENT:
  // "Precondition check failed." on a FIRST page is an identity/auth fault
  // (e.g. a service-account token minted with no `sub`), not a stale cursor.
  // Re-bootstrapping on it would re-fetch page 1, fail identically, and loop
  // forever. It MUST stay terminal.
  test("tst_gts_gp_007 FAILED_PRECONDITION with NO page_token stays a hard error", async () => {
    const failed: FetchLike = async () => status(400, FAILED_PRECONDITION_BODY);
    const reply = await handleMessage(
      {
        id: 1,
        method: "tools/call",
        params: { name: "magnis.sync.fetch", arguments: { surface: "contacts" } },
      },
      {
        name: "google",
        version: "0.0.1",
        surfaces: ["contacts"],
        fetch: async () =>
          (await fetchContactsPage("tok", null, failed)) as never,
      },
    );
    const err = reply!.error as Record<string, unknown>;
    expect(err.code).not.toBe(CURSOR_EXPIRED_CODE);
    expect(err.code).toBe(-32000);
    expect(err.message).toContain("People API list_connections failed: HTTP 400");
  });

  // A 400 that is NOT FAILED_PRECONDITION must stay terminal even mid-pagination:
  // the mapping keys on the status, never on the bare 400.
  test("tst_gts_gp_008 non-FAILED_PRECONDITION 400 mid-pagination stays a hard error", async () => {
    const body = JSON.stringify({
      error: { code: 400, message: "Request contains an invalid argument.", status: "INVALID_ARGUMENT" },
    });
    const bad: FetchLike = async () => status(400, body);
    await expect(
      fetchContactsPage("tok", { page_token: "p2" }, bad),
    ).rejects.toThrow("People API list_connections failed: HTTP 400");
  });
});
