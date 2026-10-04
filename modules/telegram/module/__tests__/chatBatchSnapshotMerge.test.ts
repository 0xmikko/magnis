/**
 * @layer: module
 * @test-id: tst_mod_tg_ingest_001
 * @scenario: scn_tg_sync_001
 * @covers: modules/telegram/module/service.ts::ingestChatBatch
 * @deterministic: yes
 * @fixtures: inline existing chat record + 51 connector snapshots
 *
 * Test environment: TelegramModule with a scripted GraphService.
 * Clients: direct calls.
 * Mocks: GraphService only; no live Telegram session.
 * Data: one existing pinned chat and a bootstrap-sized dialog page.
 */
import type { Entity, GraphBatchInput, SyncEnvelope } from "@magnis/sdk";
import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule, page, sourceEnvelope } from "@magnis/testkit/module";
import { TelegramModule } from "../service.ts";

function chatEnvelope(chatId: number): SyncEnvelope {
  return sourceEnvelope("telegram", {
    entity_type: "telegram_chat",
    chat_id: chatId,
    title: chatId === 1 ? "Pinned chat" : `Chat ${String(chatId)}`,
    is_pinned: chatId === 1,
    pin_order: chatId - 1,
  }, {
    sourceId: "telegram",
    accountId: "acct-1",
    userId: "u1",
    identityKey: "9001",
    remoteId: `tg:chat:${String(chatId)}`,
    timestamp: "2026-07-26T19:30:00Z",
  });
}

function messageEnvelope(chatId: number): SyncEnvelope {
  return sourceEnvelope("telegram", {
    entity_type: "message",
    message_id: 7,
    chat_id: chatId,
    sender_id: 5000 + chatId,
    sender_name: `Sender ${String(chatId)}`,
    text: `Latest message ${String(chatId)}`,
    date: "2026-07-26T20:00:00Z",
  }, {
    sourceId: "telegram",
    accountId: "acct-1",
    userId: "u1",
    identityKey: "9001",
    remoteId: `tg:msg:${String(chatId)}:7`,
    timestamp: "2026-07-26T20:00:01Z",
  });
}

describe("telegram chat batch ingest", () => {
  it("tst_mod_tg_ingest_001 preserves derived preview and avatar fields during a repeated bootstrap", async () => {
    const graph = mockGraph({
      moduleSettings: () => Promise.resolve({ newChatSync: "all" }),
      admitSyncEntities: (subjects) => Promise.resolve(subjects.flatMap((subject) => [...subject.remoteIds])),
      // The page asks for its own external ids once and reads the found entities
      // once; the whole-account window is never consulted.
      findByExternalIds: (externalIds) =>
        Promise.resolve(externalIds.map((externalId) => (externalId === "tg:chat:1" ? "chat-entity-1" : null))),
      getEntities: (ids) =>
        Promise.resolve(ids.map((id): Entity => id !== "chat-entity-1" ? {
          ...entity(id, "Chat", { schemaId: "telegram.chat" }),
          properties: { chat_id: Number(id.slice("tg:chat:".length)) },
        } : {
            ...entity("chat-entity-1", "Pinned chat", {
              schemaId: "telegram.chat",
            }),
            // S4: the chat DICT is the record — the entity row carries it; the
            // render record is dead.
            properties: {
              chat_id: 1,
              title: "Pinned chat",
              last_message_date: "2026-07-26T19:00:00Z",
              last_message_preview: "Existing last message",
              last_sender_name: "Mikko",
              avatar_url: "/media/avatars/tg_chat_1.jpg",
              // Telegram's exact count from an earlier read: a snapshot that
              // omits it (CatchUp, a live page) must not erase it.
              message_count: 4321,
            },
          })),
      listEntitiesWindow: () => Promise.reject(new Error("whole-account chat scan is forbidden")),
      // The operator's edge to the existing chat is read once (kind-filtered)
      // before it is written again: the page's state joins what it holds.
      findByExternalId: (externalId) => Promise.resolve(externalId === "tg:account:9001" ? "self-id" : null),
      listLinked: () => Promise.resolve(page([])),
      applyBatch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, item.key])),
          created: 0,
          updated: fragment.entities.length,
          linksAdded: 0,
          droppedKeys: [], resolved: [],
        }),
    });
    const module = mountModule(TelegramModule, {
      graph,
      ctx: { extensionId: "telegram" },
    }).module;

    await module.ingest({
      envelopes: Array.from({ length: 51 }, (_, index) => chatEnvelope(index + 1)),
    });

    const applyBatch = graph.spies.applyBatch;
    if (applyBatch === undefined) throw new Error("chat batch merge: missing applyBatch spy");
    const firstCall = applyBatch.mock.calls.find((call) => (call[0] as GraphBatchInput).entities.some((item) => item.key === "tg:chat:1"));
    if (firstCall === undefined) throw new Error("chat batch merge: applyBatch was not called");
    const firstBatch = firstCall[0] as GraphBatchInput;
    const pinnedChat = firstBatch.entities.find((item) => item.key === "tg:chat:1");

    // S4: the batch writes the DICTIONARY under the chat's
    // external id; per-account state (is_pinned/pin_order) leaves the dict for
    // the observed_in edge from the operator's account.
    expect(pinnedChat?.externalId).toBe("tg:chat:1");
    expect(pinnedChat?.properties).toMatchObject({
      last_message_date: "2026-07-26T19:00:00Z",
      last_message_preview: "Existing last message",
      last_sender_name: "Mikko",
      avatar_url: "/media/avatars/tg_chat_1.jpg",
      message_count: 4321,
    });
    expect(pinnedChat?.properties).not.toHaveProperty("is_pinned");
    const stateLink = firstBatch.links.find(
      (l) => l.toKey === "tg:chat:1" && l.kind === "observed_in",
    );
    expect(stateLink?.fromKey).toBe("self");
    expect(stateLink?.metadata).toMatchObject({ is_pinned: true, pin_order: 0 });
    expect(firstBatch.entities.find((entity) => entity.key === "self")?.externalId).toBe("tg:account:9001");
  });

  /**
   * @test-id: tst_mod_tg_ingest_002
   * @scenario: scn_tg_sync_002
   * @covers: modules/telegram/module/service.ts::ingest,ingestChatBatch,ingestMessageBatch
   * @deterministic: yes
   * @fixtures: inline catch-up page with 51 chat snapshots and one message per chat
   *
   * Test environment: TelegramModule with a strict GraphService double.
   * Clients: direct calls.
   * Mocks: GraphService only; no live Telegram session.
   * Data: one bounded source page containing chats before their messages.
   */
  it("tst_mod_tg_ingest_002 reuses chat state within one sync page instead of issuing per-chat reads and updates", async () => {
    const graph = mockGraph({
      admitSyncEntities: (subjects) => Promise.resolve(subjects.flatMap((subject) => [...subject.remoteIds])),
      findByExternalIds: (externalIds) =>
        Promise.resolve(externalIds.map((externalId) => `chat-entity-${externalId.slice("tg:chat:".length)}`)),
      getEntities: (ids) =>
        Promise.resolve(ids.map((id) => {
          const chatId = Number(id.slice("chat-entity-".length));
          return {
            ...entity(id, `Chat ${String(chatId)}`, { schemaId: "telegram.chat" }),
            properties: {
              chat_id: chatId,
              title: `Chat ${String(chatId)}`,
              last_message_date: "2026-07-26T19:00:00Z",
              last_message_preview: "Previous message",
              last_sender_name: "Previous sender",
            },
          };
        })),
      listEntitiesWindow: () => Promise.reject(new Error("whole-account chat scan is forbidden")),
      // One operator lookup per page, one kind-filtered edge read per existing
      // chat: never an external id or entity lookup per chat.
      findByExternalId: (externalId) => externalId === "tg:account:9001"
        ? Promise.resolve("self-id")
        : Promise.reject(new Error("per-chat external id lookup is forbidden")),
      listLinked: (spec) => {
        expect(spec).toMatchObject({ linkKind: "observed_in", direction: "in" });
        return Promise.resolve(page([]));
      },
      getEntity: () => Promise.reject(new Error("per-chat entity lookup is forbidden")),
      updateProperties: () => Promise.reject(new Error("per-chat denormalization update is forbidden")),
      updatePropertiesBatch: () => Promise.reject(new Error("per-chat denormalization update is forbidden")),
      applyBatch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, `id:${item.key}`])),
          created: 0,
          updated: fragment.entities.length,
          linksAdded: fragment.links.length,
          droppedKeys: [], resolved: [],
        }),
    });
    const module = mountModule(TelegramModule, {
      graph,
      ctx: { extensionId: "telegram" },
    }).module;
    const chatIds = Array.from({ length: 51 }, (_, index) => index + 1);

    await expect(module.ingest({
      envelopes: chatIds.flatMap((chatId) => [chatEnvelope(chatId), messageEnvelope(chatId)]),
    })).resolves.toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] });

    expect(graph.spies.findByExternalIds).toHaveBeenCalledTimes(1);
    expect(graph.spies.getEntities).toHaveBeenCalledTimes(1);
    expect(graph.spies.listEntitiesWindow).not.toHaveBeenCalled();
    expect(graph.spies.findByExternalId).toHaveBeenCalledTimes(1);
    expect(graph.spies.listLinked).toHaveBeenCalledTimes(51);
    expect(graph.spies.getEntity).not.toHaveBeenCalled();
    expect(graph.spies.updatePropertiesBatch).not.toHaveBeenCalled();
    const applyBatch = graph.spies.applyBatch;
    if (applyBatch === undefined) throw new Error("chat page reuse: missing applyBatch spy");
    const firstBatch = applyBatch.mock.calls[0]?.[0] as GraphBatchInput | undefined;
    expect(firstBatch?.entities.find((item) => item.key === "tg:chat:1")?.properties).toMatchObject({
      last_message_date: "2026-07-26T20:00:00Z",
      last_message_preview: "Latest message 1",
      last_sender_name: "Sender 1",
    });
  });
});
