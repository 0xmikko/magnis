import { describe, expect, test } from "bun:test";
import { fetchMockGmail } from "./fetch";

describe("mock-gmail sync", () => {
  test("tst_conn_mockgmail_ts_001 fetch is stateless and empty", async () => {
    expect(await fetchMockGmail({ surface: "email", cursor: { page: 4 } })).toEqual({
      envelopes: [],
      nextCursor: null,
      hasMore: false,
    });
    expect(await fetchMockGmail({ surface: "meetings" })).toEqual({
      envelopes: [],
      nextCursor: null,
      hasMore: false,
    });
  });
});
