// tst_linkedin_probe: anysite probe — resolves one public
// profile with the injected key; subject is the masked key; rejects on a
// dead key / missing key. NO live network.
import { describe, test, expect } from "bun:test";
import { probeLinkedInAuth } from "./probe";
import type { FetchLike } from "./api";

describe("anysite probeAuth", () => {
  test("valid key → resolves a profile, subject = masked key", async () => {
    const fetchFn: FetchLike = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => [{ name: "LinkedIn", urn: "urn:li:x", url: "u" }],
      }) as never;
    const r = await probeLinkedInAuth({ api_key: "sk-test-ab12" }, fetchFn);
    expect(r.subject).toBe("anysite …ab12");
  });

  test("no profile resolved → key rejected", async () => {
    const fetchFn: FetchLike = async () =>
      ({ ok: true, status: 200, json: async () => [] }) as never;
    await expect(probeLinkedInAuth({ api_key: "sk" }, fetchFn)).rejects.toThrow(
      /key rejected/,
    );
  });

  test("missing key → rejected before any network call", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("must not be called");
    };
    await expect(probeLinkedInAuth({}, fetchFn)).rejects.toThrow(/missing api_key/);
  });
});
