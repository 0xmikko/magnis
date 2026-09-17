/**
 * @layer: module
 * @test-id: tst_module_telegram_plan_001
 * @scenario: scn_telegram_sync_plan_001
 * @covers: plugins/modules/telegram/module/service.ts::ingest (sync_plan), syncPlan, shouldIndex
 * @deterministic: yes
 * @fixtures: six chats with fixed counts, pins and indexing choices; strict graph double
 *
 * The account's second number is what the sync PLANS to download, so that
 * after backfill the two numbers meet like a log. The module decides
 * admission (private chats, groups up to the threshold, the operator's
 * is_indexed choice, pins), so the module states the plan: an admitted
 * chat counts in full, every other chat its first fifty, a chat Telegram
 * has not counted yet is reported, never guessed.
 */
import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule, windowRow } from "@magnis/testkit/module";
import { CHAT, TELEGRAM_ACCOUNT } from "../../schema.ts";
import { TelegramModule } from "../service.ts";

function chat(id: number, title: string, props: Record<string, unknown>): ReturnType<typeof entity> {
  return entity(`chat-${String(id)}`, title, { schema_id: CHAT, properties: { chat_id: id, title, ...props } });
}

describe("tst_module_telegram_plan_001 — the module states its sync plan", () => {
  it("counts admitted and pinned chats in full, the first fifty of the rest, and reports uncounted chats, without a traversal per chat", async () => {
    const rows = [
      chat(1, "Private", { type: "private", message_count: 1200 }),
      chat(2, "Small group", { type: "group", member_count: 40, message_count: 300 }),
      chat(3, "Large channel", { type: "supergroup", member_count: 5000, message_count: 886287 }),
      chat(4, "Large but forced on", { type: "supergroup", member_count: 900, message_count: 7000, is_indexed: true }),
      chat(5, "Private but forced off", { type: "private", message_count: 20, is_indexed: false }),
      chat(6, "Never counted", { type: "group", member_count: 10 }),
      chat(7, "Pinned large channel", { type: "supergroup", member_count: 3000, message_count: 100 }),
    ];
    const operator = entity("operator", "Me", {
      schema_id: TELEGRAM_ACCOUNT, anchor: "tg:account:9001", properties: { telegram_user_id: 9001, is_self: true },
    });
    const windows: string[] = [];
    const graph = mockGraph({
      list_entities_by_property_field: () => Promise.resolve({ items: [operator], total: 1 }),
      // Pins are the operator's observed state: one edge-filtered window,
      // proportional to the pinned set, answers them for every chat at once.
      list_entities_window: (spec) => {
        windows.push(spec.filter_op === "eq" ? "pinned" : "all");
        if (spec.filter_op === "eq") {
          expect(spec.filter_field).toEqual({ edge_kind: "observed_in", observer_anchor: "tg:account:9001", edge_path: "is_pinned" });
          const pinned = rows[6];
          if (pinned === undefined) throw new Error("fixture");
          return Promise.resolve({ items: [windowRow(pinned)], total: 1 });
        }
        // The host frames an answer at one mebibyte: a roster of thousands
        // must come in pages, never in one window of a million.
        if (spec.limit > 500) return Promise.reject(new Error("chat window wider than the host frame allows"));
        return Promise.resolve({ items: rows.slice(spec.offset, spec.offset + spec.limit).map(windowRow), total: rows.length });
      },
      list_linked: () => Promise.reject(new Error("the plan must not traverse observed_in per chat")),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    const result = await module.ingest({ sync_plan: {} });

    expect(result).toEqual({
      plan: {
        unit: "messages",
        // 1200 + 300 + 7000 + the pinned 100 in full; 50 of the large channel; 20 of the forced-off chat.
        planned: 8670,
        // The large channel and the forced-off chat: what their history holds beyond the plan.
        excluded_scopes: 2,
        excluded_items: 886237,
        uncounted_scopes: 1,
      },
    });
    expect(windows.sort()).toEqual(["all", "pinned"]);
  });
});
