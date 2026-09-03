/**
 * @layer: module
 * @test-id: tst_mod_tg_ingest_001
 * @scenario: scn_tg_sync_001
 * @covers: plugins/modules/telegram/module/service.ts::ingestChatBatch
 * @deterministic: yes
 * @fixtures: inline existing chat record + 51 connector snapshots
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
} from "../../types.ts";

function chatEnvelope(chatId: number): SyncEnvelope {
  return {
    source_id: "telegram",
    surface: "telegram",
    account_id: "acct-1",
    user_id: "u1",
    kind: "snapshot",
    identity_key: "9001",
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
    const graph = mockGraph({
      list_entities_window: () =>
        Promise.resolve({
          items: [
            {
              entity: {
                ...entity("chat-entity-1", "Pinned chat", {
                  schema_id: "telegram.chat",
                }),
                // S4: the chat DICT is the record — the window's entity row
                // carries it; the render record is dead.
                properties: {
                  chat_id: 1,
                  title: "Pinned chat",
                  last_message_date: "2026-07-26T19:00:00Z",
                  last_message_preview: "Existing last message",
                  last_sender_name: "Mikko",
                  avatar_url: "/media/avatars/tg_chat_1.jpg",
                },
              },
              data: null,
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

    // S4: the batch writes the DICTIONARY under the chat's
    // anchor; per-account state (is_pinned/pin_order) leaves the dict for
    // the observed_in edge from the operator's account.
    expect(pinnedChat?.anchor).toBe("tg:chat:1");
    expect(pinnedChat?.properties).toMatchObject({
      last_message_date: "2026-07-26T19:00:00Z",
      last_message_preview: "Existing last message",
      last_sender_name: "Mikko",
      avatar_url: "/media/avatars/tg_chat_1.jpg",
    });
    expect(pinnedChat?.properties?.is_pinned).toBeUndefined();
    const stateLink = firstBatch.links?.find(
      (l) => l.to_key === "tg:chat:1" && l.kind === "observed_in",
    );
    expect(stateLink?.from_key).toBe("self");
    expect(stateLink?.metadata).toMatchObject({ is_pinned: true, pin_order: 0 });
    expect(firstBatch.entities.find((entity) => entity.key === "self")?.anchor).toBe("tg:account:9001");
  });
});
