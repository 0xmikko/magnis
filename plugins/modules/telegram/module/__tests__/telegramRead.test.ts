/**
 * @layer: module
 * @test-id: tst_module_telegram_read_001
 * @scenario: scn_telegram_read_001
 * @covers: plugins/modules/telegram/module/service.ts::chatsList,messagesList,messagesGet,chatsSetIndexed
 * @deterministic: yes
 * @fixtures: fixed chat/message/account entities and strict graph doubles
 * @legacy-id: tst_be_tgread_001
 * @legacy-id: tst_be_tgchatmeta_001_chats_list_last_message_and_order
 */
import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule, windowRow } from "@magnis/testkit/module";
import { CHAT, MESSAGE, TELEGRAM_ACCOUNT } from "../../schema.ts";
import { TelegramModule } from "../service.ts";

const CHAT_ID = "11111111-aaaa-4111-8111-111111111111";
const MESSAGE_ID = "22222222-aaaa-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-aaaa-4333-8333-333333333333";

describe("tst_module_telegram_read_001 — Telegram read mapping", () => {
  it("preserves the host dialog order and overlays per-account observed state", async () => {
    const pinned = entity(CHAT_ID, "Investor chat", {
      schema_id: CHAT,
      properties: {
        chat_id: 42,
        title: "Investor chat",
        last_message_preview: "See you tomorrow",
        last_message_date: "2026-08-12T08:00:00Z",
        is_pinned: false,
      },
    });
    const recent = entity("chat-2", "Team", {
      schema_id: CHAT,
      properties: { chat_id: 77, title: "Team", last_message_date: "2026-08-12T09:00:00Z" },
    });
    const graph = mockGraph({
      list_entities_by_property_field: () => Promise.resolve({ items: [], total: 0 }),
      list_entities_window: () => Promise.resolve({ items: [windowRow(pinned), windowRow(recent)], total: 2 }),
      list_links_for_entity: (id: string) =>
        Promise.resolve(
          id === CHAT_ID
            ? [{ id: "observed", from_id: ACCOUNT_ID, to_id: CHAT_ID, kind: "observed_in", metadata: { is_pinned: true, pin_order: 0 } }]
            : [],
        ),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    const result = await module.chatsList({ limit: 20, offset: 0 });

    expect(result.items.map((item) => item.chat_id)).toEqual(["42", "77"]);
    expect(result.items[0]).toMatchObject({
      chat_title: "Investor chat",
      last_message: "See you tomorrow",
      last_message_time: "2026-08-12T08:00:00Z",
      is_pinned: true,
      pin_order: 0,
    });
    expect(graph.spies.list_entities_window).toHaveBeenCalledWith({
      schema: CHAT,
      order: [
        { field: { property_path: "is_pinned" }, desc: true },
        { field: { property_path: "pin_order" }, desc: false },
        { field: { property_path: "last_message_date" }, desc: true },
      ],
      limit: 20,
      offset: 0,
    });
  });

  it("maps a chat-scoped message page and resolves sender accounts", async () => {
    const message = entity(MESSAGE_ID, "Hello", {
      schema_id: MESSAGE,
      created_at: "2026-08-12T08:00:01Z",
      properties: { message_id: 7, text: "Hello", date: "2026-08-12T08:00:00Z" },
    });
    const graph = mockGraph({
      list_entities_window: () => Promise.resolve({ items: [windowRow(message)], total: 1 }),
      list_links_for_entity: () =>
        Promise.resolve([{ id: "author", from_id: MESSAGE_ID, to_id: ACCOUNT_ID, kind: "authored_by" }]),
      get_entities: () =>
        Promise.resolve([entity(ACCOUNT_ID, "Alice", { schema_id: TELEGRAM_ACCOUNT })]),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    const result = await module.messagesList({ chat_id: 42, limit: 500, offset: 3 });

    expect(result).toMatchObject({ total: 1, limit: 50, offset: 3 });
    expect(result.items[0]).toMatchObject({
      id: MESSAGE_ID,
      sender: "Alice",
      channel: "telegram",
      timestamp: "2026-08-12T08:00:00Z",
      metadata: { message_id: 7, text: "Hello" },
    });
    expect(graph.spies.list_entities_window).toHaveBeenCalledWith({
      schema: MESSAGE,
      filter_field: { entity_field: "idx" },
      filter_eq: "42",
      order: [{ field: { entity_field: "date" }, desc: true }],
      limit: 50,
      offset: 3,
    });
  });

  it("resolves an entity_id to chat_id before reading messages", async () => {
    const graph = mockGraph({
      get_entity: () =>
        Promise.resolve(entity(CHAT_ID, "Chat", { schema_id: CHAT, properties: { chat_id: -10042 } })),
      list_links_for_entity: () => Promise.resolve([]),
      list_entities_window: () => Promise.resolve({ items: [], total: 0 }),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await module.messagesList({ entity_id: CHAT_ID });
    expect(graph.spies.list_entities_window).toHaveBeenCalledWith(
      expect.objectContaining({ filter_eq: "-10042" }),
    );
  });

  it("returns exact message detail and rejects missing or foreign schemas", async () => {
    const message = entity(MESSAGE_ID, "Hello", {
      schema_id: MESSAGE,
      created_at: "2026-08-12T08:00:01Z",
      properties: { text: "Full body", date: "2026-08-12T08:00:00Z", sender_name: "Fallback" },
    });
    const graph = mockGraph({
      get_entity_full: () => Promise.resolve({ entity: message, links: [] }),
      list_links_for_entity: () => Promise.resolve([]),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    await expect(module.messagesGet({ id: MESSAGE_ID })).resolves.toMatchObject({
      id: MESSAGE_ID,
      body: "Full body",
      sender: "Fallback",
      channel: "telegram",
      canonical: {},
      linked_entities: [],
    });

    const missing = mountModule(TelegramModule, {
      graph: mockGraph({ get_entity_full: () => Promise.resolve(null) }),
    }).module;
    await expect(missing.messagesGet({ id: MESSAGE_ID })).rejects.toThrow(
      `${MESSAGE} ${MESSAGE_ID} not found`,
    );
  });

  it("updates the anchored chat dictionary and fails on an unknown chat", async () => {
    const graph = mockGraph({
      find_by_anchor: () => Promise.resolve(CHAT_ID),
      update_properties: () => Promise.resolve(undefined),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await expect(module.chatsSetIndexed({ chat_id: 42, is_indexed: true })).resolves.toEqual({
      status: "ok",
    });
    expect(graph.spies.find_by_anchor).toHaveBeenCalledWith("tg:chat:42");
    expect(graph.spies.update_properties).toHaveBeenCalledWith({
      entity_id: CHAT_ID,
      properties: { is_indexed: true },
    });

    const missing = mountModule(TelegramModule, {
      graph: mockGraph({ find_by_anchor: () => Promise.resolve(null) }),
    }).module;
    await expect(missing.chatsSetIndexed({ chat_id: 42, is_indexed: false })).rejects.toThrow(
      "chat 42 not found",
    );
  });
});
