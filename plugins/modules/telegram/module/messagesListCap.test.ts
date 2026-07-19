/**
 * @layer: fe_agent
 * @test-id: tst_fe_tg_messages_list_cap_001
 *
 * INV-5: telegram.messages.list is a thin chat reader and must HARD-CAP its page
 * size (max 50) — a caller asking for everything must NOT dump a whole history
 * into the agent context (the 37,904-message bug). The clamp is server-side,
 * independent of the requested `limit`.
 */
import { describe, it, expect, vi } from "vitest";
import { TelegramModule } from "./service.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeModule(listEntities: any) {
  const graph = {
    list_entities: listEntities,
    list_facets_for_entities: vi.fn(async () => []),
  } as any;
  const rpc = { execute: vi.fn() } as any;
  return new (TelegramModule as any)({ graph, rpc });
}

describe("tst_fe_tg_messages_list_cap_001 — messages.list hard cap", () => {
  it("clamps a huge limit to 50 (no full-history dump)", async () => {
    const spy = vi.fn(async (_params: { limit?: number }) => ({ items: [], total: 0 }));
    const mod = makeModule(spy);
    await (mod as any).messagesList({ limit: 100000 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].limit).toBe(50);
  });

  it("defaults to 50 when no limit is given", async () => {
    const spy = vi.fn(async (_params: { limit?: number }) => ({ items: [], total: 0 }));
    const mod = makeModule(spy);
    await (mod as any).messagesList({});
    expect(spy.mock.calls[0][0].limit).toBe(50);
  });

  it("passes through a small explicit limit unchanged", async () => {
    const spy = vi.fn(async (_params: { limit?: number }) => ({ items: [], total: 0 }));
    const mod = makeModule(spy);
    await (mod as any).messagesList({ limit: 10 });
    expect(spy.mock.calls[0][0].limit).toBe(10);
  });
});
