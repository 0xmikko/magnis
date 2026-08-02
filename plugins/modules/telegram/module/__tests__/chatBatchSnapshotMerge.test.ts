/**
 * @layer: module
 * @test-id: tst_mod_tg_ingest_001
 * @scenario: scn_tg_sync_001
 * @covers: plugins/modules/telegram/module/service.ts::ingestChatBatch
 * @deterministic: yes
 * @fixtures: inline existing chat facet + 51 connector snapshots
 *
 * Test environment: TelegramModule with a scripted GraphService.
 * Clients: direct calls.
 * Mocks: GraphService only; no live Telegram session.
 * Data: one existing pinned chat and a bootstrap-sized dialog page.
 */
import { describe, expect, it } from "vitest";
import type { GraphBatchInput } from "@magnis/plugin-sdk";
import { entity, mockGraph, mountModule } from "@magnis/testkit/module";
import { TelegramModule } from "../service.ts";
import type {
  SyncEnvelope,
  TelegramCanonical,
  TelegramFacets,
} from "../../types.ts";

function chatEnvelope(chatId: number): SyncEnvelope {
  return {
    source_id: "telegram",
    surface: "telegram",
    account_id: "acct-1",
    user_id: "u1",
    kind: "snapshot",
    remote_id: `tg:chat:${String(chatId)}`,
    payload: {
      entity_type: "telegram_chat",
      chat_id: chatId,
      title: chatId === 1 ? "Pinned chat" : `Chat ${String(chatId)}`,
      is_pinned: chatId === 1,
      pin_order: chatId - 1,
    },
    timestamp: "2026-07-26T19:30:00Z",
  };
}

describe("telegram chat batch ingest", () => {
  it("tst_mod_tg_ingest_001 preserves derived preview and avatar fields during a repeated bootstrap", async () => {
    const graph = mockGraph<TelegramFacets, TelegramCanonical>({
      list_entities_window: () =>
        Promise.resolve({
          items: [
            {
              entity: entity("chat-entity-1", "Pinned chat", {
                schema_id: "telegram.chat",
              }),
              data: {
                chat_id: 1,
                title: "Pinned chat",
                is_pinned: true,
                last_message_date: "2026-07-26T19:00:00Z",
                last_message_preview: "Existing last message",
                last_sender_name: "Mikko",
                avatar_url: "/media/avatars/tg_chat_1.jpg",
              },
            },
          ],
          total: 1,
        }),
      apply_batch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, item.key])),
          created: 0,
          updated: fragment.entities.length,
          links_added: 0,
          dropped_keys: [],
        }),
    });
    const module = mountModule(TelegramModule, {
      graph,
      ctx: { extension_id: "telegram" },
    }).module;

    await module.ingest({
      envelopes: Array.from({ length: 51 }, (_, index) => chatEnvelope(index + 1)),
    });

    const applyBatch = graph.spies.apply_batch;
    if (applyBatch === undefined) throw new Error("chat batch merge: missing apply_batch spy");
    const firstCall = applyBatch.mock.calls[0];
    if (firstCall === undefined) throw new Error("chat batch merge: apply_batch was not called");
    const firstBatch = firstCall[0] as GraphBatchInput;
    const pinnedChat = firstBatch.entities.find((item) => item.key === "tg:chat:1");
    const details = pinnedChat?.facets[0]?.data as Record<string, unknown>;

    expect(details).toMatchObject({
      last_message_date: "2026-07-26T19:00:00Z",
      last_message_preview: "Existing last message",
      last_sender_name: "Mikko",
      avatar_url: "/media/avatars/tg_chat_1.jpg",
    });
  });
});
