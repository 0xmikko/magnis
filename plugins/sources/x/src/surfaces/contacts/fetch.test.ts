// tst_x_contacts_surface: the contacts surface turns the
// following list into social_contact envelopes — cursor-seeded import spec,
// paged via nextCursor, clean empty fetch when nothing was requested.
// NO live network (fake fetch).
import { describe, test, expect } from "bun:test";
import { fetchXContacts } from "./fetch";
import type { FetchLike } from "../../api";

function pagedApi(pages: Array<Array<Record<string, unknown>>>) {
  const calls: string[] = [];
  let page = 0;
  const fetchFn: FetchLike = async (url) => {
    calls.push(url);
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (url.includes("/2/users/by/username/me")) {
      return ok({ data: { id: "77", username: "me", name: "Me" } });
    }
    if (url.includes("/2/users/77/following")) {
      const data = pages[page] ?? [];
      const next = page < pages.length - 1 ? `tok-${page + 1}` : undefined;
      page += 1;
      return ok({ data, ...(next ? { meta: { next_token: next } } : { meta: {} }) });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchFn, calls };
}

const acct = (i: number) => ({
  id: `u${i}`,
  username: `Friend${i}`,
  name: `Friend ${i}`,
});

const META = { bearer_token: "tok" };

describe("x connector contacts surface", () => {
  test("unseeded cursor → clean empty fetch, zero API calls", async () => {
    const { fetchFn, calls } = pagedApi([]);
    const r = await fetchXContacts({ surface: "contacts", cursor: null, meta: META }, fetchFn);
    expect(r.envelopes).toEqual([]);
    expect(r.hasMore).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("seeded import maps social_contact envelopes with ALL required fields", async () => {
    const { fetchFn } = pagedApi([[acct(1), acct(2)]]);
    const r = await fetchXContacts(
      { surface: "contacts", cursor: { import: { handle: "me" } }, meta: META },
      fetchFn,
    );
    expect(r.hasMore).toBe(false);
    expect(r.envelopes).toHaveLength(2);
    const env = r.envelopes[0]!;
    expect(env.surface).toBe("contacts");
    expect(env.remote_id).toBe("x:social:friend1");
    expect(env.payload).toEqual({
      kind: "social_contact",
      handle: "Friend1",
      display_name: "Friend 1",
      profile_url: "https://x.com/Friend1",
    });
  });

  test("pages via nextCursor carrying owner_id + token, honors limit", async () => {
    const { fetchFn, calls } = pagedApi([[acct(1), acct(2)], [acct(3), acct(4)]]);
    const first = await fetchXContacts(
      { surface: "contacts", cursor: { import: { handle: "me", limit: 3 } }, meta: META },
      fetchFn,
    );
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toMatchObject({ owner_id: "77", token: "tok-1", fetched: 2 });

    const second = await fetchXContacts(
      { surface: "contacts", cursor: first.nextCursor, meta: META },
      fetchFn,
    );
    expect(second.envelopes).toHaveLength(1); // limit 3 − 2 already fetched
    expect(second.hasMore).toBe(false);
    // 1 owner lookup + 2 pages (second call reuses owner_id — no re-lookup).
    expect(calls).toHaveLength(3);
  });
});

// Failure paths (restored from the deleted following.test.ts):
// 429 → typed RateLimitError; unknown handle → typed error; provider 5xx →
// XApiError; missing bearer rejects before any call.
import { RateLimitError } from "@magnis/connector-sdk";

describe("x connector contacts surface — failure paths", () => {
  const META = { bearer_token: "tok" };

  test("429 on the following page → RateLimitError (host backs off)", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.includes("/2/users/by/username/")) {
        return { ok: true, status: 200, json: async () => ({ data: { id: "77", username: "me" } }) } as never;
      }
      return { ok: false, status: 429, json: async () => ({}) } as never;
    };
    await expect(
      fetchXContacts({ surface: "contacts", cursor: { import: { handle: "me" } }, meta: META }, fetchFn),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  test("unknown handle → handle_not_found", async () => {
    const fetchFn: FetchLike = async () =>
      ({ ok: true, status: 200, json: async () => ({}) }) as never;
    await expect(
      fetchXContacts({ surface: "contacts", cursor: { import: { handle: "ghost" } }, meta: META }, fetchFn),
    ).rejects.toThrow(/handle_not_found/);
  });

  test("provider 500 on the page → typed API error", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.includes("/2/users/by/username/")) {
        return { ok: true, status: 200, json: async () => ({ data: { id: "77", username: "me" } }) } as never;
      }
      return { ok: false, status: 500, json: async () => ({}) } as never;
    };
    await expect(
      fetchXContacts({ surface: "contacts", cursor: { import: { handle: "me" } }, meta: META }, fetchFn),
    ).rejects.toThrow(/following page failed/);
  });

  test("missing bearer with a seeded import → rejected before any call", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("must not be called");
    };
    await expect(
      fetchXContacts({ surface: "contacts", cursor: { import: { handle: "me" } }, meta: {} }, fetchFn),
    ).rejects.toThrow(/missing bearer_token/);
  });
});
