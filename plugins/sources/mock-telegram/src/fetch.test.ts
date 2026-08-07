import { describe, expect, test } from "bun:test";
import { fetchMockTelegram } from "./fetch";

describe("mock-telegram sync", () => {
  test("tst_conn_mocktelegram_ts_001 fetch is stateless and empty", async () => {
    expect(await fetchMockTelegram({ surface: "telegram", cursor: 99 })).toEqual({
      envelopes: [],
      nextCursor: null,
      hasMore: false,
    });
  });
});
