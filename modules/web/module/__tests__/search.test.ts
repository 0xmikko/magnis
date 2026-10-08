/** Searching the internet, of the web-source plan (`docs/plans/web-source.md`
 * in magnis-app, Stage D2-S3): `web.link.search_global` asks the Source and
 * writes nothing.
 * @test-id: tst_web_search_001
 */
import { describe, expect, it } from "vitest";
import { mockGraph, mountModule } from "@magnis/testkit/module";

import { WebModule } from "../service.ts";

describe("web.link.search_global", () => {
  it("tst_web_search_001 answers the Source's results, and the Graph sees no write", async () => {
    const commands: { payload: Record<string, unknown>; accountId: string | undefined }[] = [];
    const graph = mockGraph({
      sourceCommand: (payload, accountId) => {
        commands.push({ payload, accountId });
        return Promise.resolve({ results: [
          { url: "https://example.com/a", title: "A", snippet: "first" },
          { url: "https://example.org/b", title: "B", snippet: "second" },
        ] });
      },
    });
    const module = mountModule(WebModule, { graph, ctx: { extensionId: "web" } }).module;

    expect(await module.searchGlobal({ query: "magnis web", limit: 2 })).toEqual({ results: [
      { url: "https://example.com/a", title: "A", snippet: "first" },
      { url: "https://example.org/b", title: "B", snippet: "second" },
    ] });
    expect(commands).toEqual([{ payload: { action: "search", query: "magnis web", limit: 2 }, accountId: "web" }]);
    // Any other Graph operation would have thrown: the mock knows only sourceCommand.
    expect(Object.keys(graph.spies)).toEqual(["sourceCommand"]);

    const malformed = mountModule(WebModule, {
      graph: mockGraph({ sourceCommand: () => Promise.resolve({ results: [{ url: "https://example.com/a" }] }) }),
      ctx: { extensionId: "web" },
    }).module;
    await expect(malformed.searchGlobal({ query: "x", limit: 1 })).rejects.toThrow("search answer result 0 title must be a string");
  });
});
