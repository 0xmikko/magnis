// tst_x_probe: the ProbeAuth contract itself — the probe MUST
// hit the real endpoint with the injected key, return the provider-verified
// subject, and reject on 401/no-identity/missing key. NO live network.
import { describe, test, expect } from "bun:test";
import { probeXAuth } from "./probe";
import type { FetchLike } from "./api";

const ok = (body: unknown): ReturnType<FetchLike> =>
  Promise.resolve({ ok: true, status: 200, json: async () => body } as never);

describe("x probeAuth (F3)", () => {
  test("valid key → provider-verified @subject", async () => {
    let seenAuth = "";
    const fetchFn: FetchLike = async (url, init) => {
      expect(url).toContain("/2/users/me");
      seenAuth = String((init?.headers as Record<string, string>).authorization);
      return ok({ data: { username: "dltx_mike" } });
    };
    const r = await probeXAuth({ bearer_token: "tok-1" }, fetchFn);
    expect(r.subject).toBe("@dltx_mike");
    expect(seenAuth).toBe("Bearer tok-1");
  });

  test("provider 401 → rejected, no subject", async () => {
    const fetchFn: FetchLike = async () =>
      ({ ok: false, status: 401, json: async () => ({}) }) as never;
    await expect(probeXAuth({ bearer_token: "bad" }, fetchFn)).rejects.toThrow(/HTTP 401/);
  });

  test("app-only key: whoami 403 → verified via public lookup, masked subject", async () => {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      calls.push(String(url));
      if (String(url).includes("/2/users/me")) {
        return { ok: false, status: 403, json: async () => ({}) } as never;
      }
      return { ok: true, status: 200, json: async () => ({ data: { id: "12" } }) } as never;
    };
    const r = await probeXAuth({ bearer_token: "sk-app-only-cd34" }, fetchFn);
    expect(r.subject).toBe("x app …cd34");
    expect(calls[1]).toContain("/2/users/by/username/");
  });

  test("app-only path: dead key fails BOTH steps → rejected", async () => {
    const fetchFn: FetchLike = async (url) =>
      ({
        ok: false,
        status: String(url).includes("/2/users/me") ? 403 : 401,
        json: async () => ({}),
      }) as never;
    await expect(probeXAuth({ bearer_token: "dead" }, fetchFn)).rejects.toThrow(/HTTP 401/);
  });

  test("no username in the response → rejected (no fabricated identity)", async () => {
    const fetchFn: FetchLike = async () => ok({ data: {} }) as never;
    await expect(probeXAuth({ bearer_token: "tok" }, fetchFn)).rejects.toThrow(/no username/);
  });

  test("missing bearer → rejected before any network call", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("must not be called");
    };
    await expect(probeXAuth({}, fetchFn)).rejects.toThrow(/missing bearer_token/);
  });
});
