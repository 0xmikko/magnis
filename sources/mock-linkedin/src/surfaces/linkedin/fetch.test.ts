import { describe, test, expect } from "bun:test";
import { fetchMockLinkedIn } from "./fetch";

describe("mock-linkedin fetch", () => {
  test("tst_mockli_001 tracked handle → profile + post (live linkedin shape)", async () => {
    const { envelopes } = await fetchMockLinkedIn({
      surface: "linkedin",
      cursor: 0,
      tracked_handles: ["anndoe"],
    });
    expect(envelopes.map((e) => e.payload.entity_type)).toEqual(["profile", "post"]);
    expect(envelopes[0]!.payload.platform).toBe("linkedin");
    expect(envelopes[1]!.payload.author_handle).toBe("anndoe");
  });

  test("tst_mockli_002 untracked handle → no envelopes (only tracked handles are ever fetched)", async () => {
    const { envelopes } = await fetchMockLinkedIn({
      surface: "linkedin",
      cursor: 0,
      tracked_handles: ["ghost"],
    });
    expect(envelopes).toHaveLength(0);
  });

  test("tst_mockli_003 pages drain after page 0", async () => {
    const { envelopes, hasMore } = await fetchMockLinkedIn({
      surface: "linkedin",
      cursor: 1,
      tracked_handles: ["anndoe"],
    });
    expect(envelopes).toHaveLength(0);
    expect(hasMore).toBe(false);
  });
});
