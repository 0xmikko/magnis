import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  fetchContactsPage,
  gpeoplePersonToContact,
  stableContactId,
  type GpeoplePerson,
} from "./contacts";
import type { FetchLike, HttpResponse } from "./http";

function ok(data: unknown): HttpResponse {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(data),
    json: async () => data,
  };
}

function fullPerson(): GpeoplePerson {
  return {
    resourceName: "people/c12345",
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
    expect(c.phones[0].number).toBe("+4930 1234567"); // canonicalForm wins
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
  });

  test("tst_gts_gp_002 display_name falls back to given/family combos", () => {
    const p = fullPerson();
    p.names![0].displayName = null;
    expect(gpeoplePersonToContact(p)!.display_name).toBe("Mikhail Lazarev");
    p.names![0].familyName = null;
    expect(gpeoplePersonToContact(p)!.display_name).toBe("Mikhail");
    p.names![0].givenName = null;
    p.names![0].familyName = "Lazarev";
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
    expect(gpeoplePersonToContact(p)!.phones[0].number).toBe("030 111");
  });
});

describe("contacts fetch", () => {
  test("tst_gts_gp_005 envelopes + cursor null on last page + skip counted out", async () => {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      calls.push(url);
      if (url.includes("pageToken=p2")) {
        return ok({
          connections: [
            { ...fullPerson(), resourceName: "people/c2" },
            { resourceName: "people/cEmpty" }, // skipped: no identity
          ],
        });
      }
      return ok({ connections: [fullPerson()], nextPageToken: "p2" });
    };

    const p1 = await fetchContactsPage("tok", undefined, fetchFn);
    expect(p1.envelopes).toHaveLength(1);
    expect(p1.envelopes[0].surface).toBe("contacts");
    expect(p1.envelopes[0].kind).toBe("snapshot");
    expect(p1.envelopes[0].remote_id).toBe(
      `gpeople:${stableContactId("people/c12345")}`,
    );
    expect(p1.nextCursor).toEqual({ page_token: "p2", discovered: 1 });

    const url = new URL(calls[0]);
    expect(url.pathname).toBe("/v1/people/me/connections");
    expect(url.searchParams.get("personFields")).toBe(
      "names,emailAddresses,phoneNumbers,organizations,photos,urls",
    );
    expect(url.searchParams.get("pageSize")).toBe("100");

    const p2 = await fetchContactsPage("tok", p1.nextCursor, fetchFn);
    expect(p2.envelopes).toHaveLength(1); // identity-less person skipped
    expect(p2.nextCursor).toBeNull(); // last page
    expect(p2.discovered).toBe(2); // cumulative, counts KEPT envelopes only
  });
});
