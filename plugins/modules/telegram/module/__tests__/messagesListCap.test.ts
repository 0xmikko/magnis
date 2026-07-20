/**
 * @layer: fe_agent
 * @test-id: tst_fe_tg_messages_list_cap_001
 *
 * telegram.messages.list is a thin chat reader and must HARD-CAP its page
 * size (max 50) — a caller asking for everything must NOT dump a whole history
 * into the agent context (the 37,904-message bug). The clamp is server-side,
 * independent of the requested `limit`.
 *
 * Doubles come from @magnis/testkit/module.
 */
import { describe, it, expect } from "vitest";
import { mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { TelegramModule } from "../service.ts";
import type { TelegramCanonical, TelegramFacets } from "../../types.ts";

type G = MockGraph<TelegramFacets, TelegramCanonical>;

// No chat filter → messagesList takes the list_entities path, hydrating the page
// via one list_facets_for_entities batch.
function listGraph(): G {
  return mockGraph<TelegramFacets, TelegramCanonical>({
    list_entities: () => Promise.resolve({ items: [], total: 0 }),
    list_facets_for_entities: () => Promise.resolve([]),
  });
}

describe("tst_fe_tg_messages_list_cap_001 — messages.list hard cap", () => {
  it("clamps a huge limit to 50 (no full-history dump)", async () => {
    const graph = listGraph();
    const mod = mountModule(TelegramModule, { graph, ctx: { extension_id: "telegram" } }).module;
    await mod.messagesList({ limit: 100000 });
    expect(graph.spies.list_entities).toHaveBeenCalledTimes(1);
    expect((graph.spies.list_entities.mock.calls[0][0] as { limit?: number }).limit).toBe(50);
  });

  it("defaults to 50 when no limit is given", async () => {
    const graph = listGraph();
    const mod = mountModule(TelegramModule, { graph, ctx: { extension_id: "telegram" } }).module;
    await mod.messagesList({});
    expect((graph.spies.list_entities.mock.calls[0][0] as { limit?: number }).limit).toBe(50);
  });

  it("passes through a small explicit limit unchanged", async () => {
    const graph = listGraph();
    const mod = mountModule(TelegramModule, { graph, ctx: { extension_id: "telegram" } }).module;
    await mod.messagesList({ limit: 10 });
    expect((graph.spies.list_entities.mock.calls[0][0] as { limit?: number }).limit).toBe(10);
  });
});
