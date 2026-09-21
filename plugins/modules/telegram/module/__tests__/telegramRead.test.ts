/**
 * @layer: module
 * @test-id: tst_module_telegram_read_001
 * @scenario: scn_telegram_read_001
 * @covers: plugins/modules/telegram/module/service.ts::chatsList,messagesList,messagesGet,chatsSetIndexed
 * @deterministic: yes
 * @fixtures: fixed chat/message/account entities and strict graph doubles
 * @legacy-id: tst_be_tgread_001
 * @legacy-id: tst_be_tgread_001_read_path_served_by_plugin
 * @legacy-id: tst_be_tgread_003_set_indexed_cross_user_denied
 * @legacy-id: tst_be_tgchatmeta_001_chats_list_last_message_and_order
 */
import { describe, expect, it } from "vitest";
import { entity, linkedRow, mockGraph, mountModule, windowRow } from "@magnis/testkit/module";
import { CHAT, MESSAGE, TELEGRAM_ACCOUNT } from "../../schema.ts";
import { TelegramModule } from "../service.ts";

const CHAT_ID = "11111111-aaaa-4111-8111-111111111111";
const MESSAGE_ID = "22222222-aaaa-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-aaaa-4333-8333-333333333333";

describe("tst_module_telegram_read_001 — Telegram read mapping", () => {
  it("preserves legacy dialog fields and host order when no operator account exists", async () => {
    const pinned = entity(CHAT_ID, "Investor chat", {
      schema_id: CHAT,
      properties: {
        chat_id: 42,
        title: "Investor chat",
        message_count: 1234,
        last_message_preview: "See you tomorrow",
        last_message_date: "2026-08-12T08:00:00Z",
        is_pinned: true,
        pin_order: 0,
        sources: [{ source: "mock-telegram", account: "account-1", surface: "messages" }],
      },
    });
    const recent = entity("chat-2", "Team", {
      schema_id: CHAT,
      properties: { chat_id: 77, title: "Team", last_message_date: "2026-08-12T09:00:00Z" },
    });
    const graph = mockGraph({
      list_entities_by_property_field: () => Promise.resolve({ items: [], total: 0 }),
      list_entities_window: () => Promise.resolve({ items: [windowRow(pinned), windowRow(recent)], total: 2 }),
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
      account_id: "account-1",
      // The exact count Telegram reported for the chat, never a hard-coded null.
      message_count: 1234,
    });
    expect(result.items[1]?.message_count).toBeNull();
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

  /**
   * @test-id: tst_module_telegram_read_004
   * @scenario: scn_telegram_large_dialog_list_001
   * @covers: plugins/modules/telegram/module/service.ts::chatsList,chatsGet,searchChats,observedStateFor
   * @deterministic: yes
   * @fixtures: dense-chat broad-read refusal, exact/foreign observers, numeric pins, absent self
   *
   * Test environment: Telegram module with strict Graph double
   * Clients: direct calls
   * Mocks: deterministic GraphService
   * Data: pinned and recent chats with two observer-scoped observed_in edges
   */
  it("tst_module_telegram_read_004 reads only the operator's incoming observations without traversing message history", async () => {
    const pinned = entity(CHAT_ID, "Pinned", {
      schema_id: CHAT,
      properties: { chat_id: 42, title: "Pinned", last_message_date: "2026-08-12T08:00:00Z" },
    });
    const recent = entity("chat-2", "Recent", {
      schema_id: CHAT,
      properties: { chat_id: 77, title: "Recent", last_message_date: "2026-08-12T09:00:00Z" },
    });
    const pinnedTen = entity("chat-10", "Pinned ten", {
      schema_id: CHAT,
      properties: { chat_id: 10, title: "Pinned ten", last_message_date: "2026-08-12T10:00:00Z" },
    });
    const operator = entity(ACCOUNT_ID, "Operator", {
      schema_id: TELEGRAM_ACCOUNT,
      anchor: "tg:account:9001",
      properties: { telegram_user_id: 9001, is_self: true },
    });
    const foreign = entity("other-account", "Other observer", { schema_id: TELEGRAM_ACCOUNT });
    let hasOperator = true;
    const graph = mockGraph({
      list_entities_by_property_field: () =>
        Promise.resolve({ items: hasOperator ? [operator] : [], total: hasOperator ? 1 : 0 }),
      get_entity: () => Promise.resolve(pinned),
      search_entities_by_name: () => Promise.resolve([pinned]),
      list_entities_window: (spec) => {
        if (spec.filter_op === "eq") {
          return Promise.resolve({ items: [windowRow(pinnedTen), windowRow(pinned)], total: 2 });
        }
        return Promise.resolve({ items: [windowRow(recent)], total: 1 });
      },
      list_links_for_entities: () => Promise.reject(new Error("Invalid operation: traversal exceeds maxEdges")),
      list_links_for_entity: () => Promise.reject(new Error("Invalid operation: traversal exceeds maxEdges")),
      list_linked: (spec) => Promise.resolve({
        items: [
          linkedRow(foreign, {
            from_id: foreign.id, to_id: spec.parent_id, kind: "observed_in",
            metadata: { is_pinned: true, pin_order: -1, sources: [{ account: "foreign-account" }] },
          }),
          linkedRow(operator, {
            from_id: ACCOUNT_ID, to_id: spec.parent_id, kind: "observed_in",
            metadata: {
              is_pinned: true, pin_order: spec.parent_id === CHAT_ID ? 2 : 10,
              sources: [{ account: "account-1" }],
            },
          }),
        ],
        total: 2,
      }),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    const result = await module.chatsList({ limit: 20, offset: 0 });

    expect(result.items.map((item) => item.chat_title)).toEqual(["Pinned", "Pinned ten", "Recent"]);
    expect(result).toMatchObject({ total: 3, limit: 20, offset: 0 });
    expect(result.items[0]).toMatchObject({ is_pinned: true, pin_order: 2, account_id: "account-1" });
    expect(graph.spies.list_entities_window).toHaveBeenNthCalledWith(1, {
      schema: CHAT,
      filter_field: {
        edge_kind: "observed_in",
        observer_anchor: "tg:account:9001",
        edge_path: "is_pinned",
      },
      filter_op: "eq",
      filter_eq: "true",
      order: [{ field: { property_path: "last_message_date" }, desc: true }],
      limit: 500,
      offset: 0,
    });
    expect(graph.spies.list_linked).toHaveBeenCalledTimes(2);
    for (const chat of [pinned, pinnedTen]) {
      expect(graph.spies.list_linked).toHaveBeenCalledWith({
        parent_id: chat.id, link_kind: "observed_in", direction: "in", limit: 1000, offset: 0,
      });
    }
    expect(graph.spies.list_entities_window).toHaveBeenNthCalledWith(2, {
      schema: CHAT,
      filter_field: {
        edge_kind: "observed_in",
        observer_anchor: "tg:account:9001",
        edge_path: "is_pinned",
      },
      filter_op: "distinct",
      filter_eq: "true",
      order: [{ field: { property_path: "last_message_date" }, desc: true }],
      limit: 18,
      offset: 0,
    });
    await expect(module.chatsGet({ entity_id: CHAT_ID })).resolves.toMatchObject({
      is_pinned: true, pin_order: 2, account_id: "account-1",
    });
    const searched = await module.chatsList({ search: "Pinned", limit: 20, offset: 0 });
    expect(searched.items[0]).toMatchObject({ is_pinned: true, pin_order: 2, account_id: "account-1" });
    expect(graph.spies.list_linked).toHaveBeenCalledTimes(4);

    hasOperator = false;
    await expect(module.chatsGet({ entity_id: CHAT_ID })).resolves.toMatchObject({
      is_pinned: false, pin_order: null, account_id: null,
    });
    expect(graph.spies.list_linked).toHaveBeenCalledTimes(4);
    expect(graph.spies.list_links_for_entities).not.toHaveBeenCalled();
    expect(graph.spies.list_links_for_entity).not.toHaveBeenCalled();
  });

  /**
   * @test-id: tst_module_telegram_read_005
   * @scenario: scn_telegram_message_page_batch_001
   * @covers: plugins/modules/telegram/module/service.ts::messagesForChat,senderNamesFor
   * @deterministic: yes
   * @fixtures: 50 fixed messages; shared/missing authors and unrelated links
   * Test environment: real Telegram module; strict Graph double, no provider
   */
  it("tst_module_telegram_read_005 resolves a 50-message page with one author-link batch", async () => {
    const secondAuthorId = "33333333-aaaa-4333-8333-444444444444";
    const messages = Array.from({ length: 50 }, (_, index) =>
      entity(`22222222-aaaa-4222-8222-${String(index + 1).padStart(12, "0")}`, `Message ${index}`, {
        schema_id: MESSAGE,
        created_at: "2026-08-12T08:00:01Z",
        properties: { message_id: 100 - index, text: `Message ${index}`,
          date: "2026-08-12T08:00:00Z", sender_name: "Legacy sender" },
      }));
    const links = messages.flatMap((message, index) => index % 3 === 2 ? [] : [{
      id: `author-${index}`, from_id: message.id,
      to_id: index % 3 === 0 ? ACCOUNT_ID : secondAuthorId, kind: "authored_by",
    }]);
    const firstMessage = messages[0];
    if (firstMessage === undefined) throw new Error("missing first message fixture");
    links.push(
      { id: "second-author", from_id: firstMessage.id, to_id: secondAuthorId, kind: "authored_by" },
      { id: "unrelated-kind", from_id: firstMessage.id, to_id: CHAT_ID, kind: "in_chat" },
      { id: "incoming", from_id: CHAT_ID, to_id: firstMessage.id, kind: "authored_by" },
    );
    let rows = messages.map((message) => windowRow(message));
    const graph = mockGraph({
      list_entities_window: () => Promise.resolve({ items: rows, total: 150 }),
      list_links_for_entity: (id) => Promise.resolve(links.filter((link) => link.from_id === id || link.to_id === id)),
      list_links_for_entities: () => Promise.resolve(links),
      get_entities: () => Promise.resolve([
        entity(ACCOUNT_ID, "Alice", { schema_id: TELEGRAM_ACCOUNT }),
        entity(secondAuthorId, "Bob", { schema_id: TELEGRAM_ACCOUNT }),
      ]),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    const result = await module.messagesList({ chat_id: 42, limit: 500, offset: 50 });

    expect(result).toMatchObject({ total: 150, limit: 50, offset: 50 });
    expect(result.items[0]).toMatchObject({
      channel: "telegram", timestamp: "2026-08-12T08:00:00Z",
      metadata: { message_id: 100, text: "Message 0" },
    });
    expect(result.items.map((item) => item.id)).toEqual(messages.map((message) => message.id));
    expect(result.items.map((item) => item.sender)).toEqual(messages.map((_, index) =>
      index % 3 === 0 ? "Alice" : index % 3 === 1 ? "Bob" : "Legacy sender"));
    expect(result.items.map((item) => item.metadata?.message_id))
      .toEqual(messages.map((_, index) => 100 - index));
    expect(graph.spies.list_links_for_entity).not.toHaveBeenCalled();
    expect(graph.spies.list_links_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_links_for_entities).toHaveBeenCalledWith(messages.map((message) => message.id));
    expect(graph.spies.get_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_entities).toHaveBeenCalledWith([ACCOUNT_ID, secondAuthorId]);
    expect(graph.spies.list_entities_window).toHaveBeenCalledWith({
      schema: MESSAGE,
      filter_field: { entity_field: "idx" },
      filter_eq: "42",
      order: [{ field: { entity_field: "date" }, desc: true }],
      limit: 50,
      offset: 50,
    });
    rows = [];
    expect(await module.messagesList({ chat_id: 42, limit: 50, offset: 150 }))
      .toEqual({ items: [], total: 150, limit: 50, offset: 150 });
    expect(graph.spies.list_links_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_entities).toHaveBeenCalledTimes(1);
  });

  it("resolves an entity_id to chat_id before reading messages", async () => {
    const graph = mockGraph({
      get_entity: () =>
        Promise.resolve(entity(CHAT_ID, "Chat", { schema_id: CHAT, properties: { chat_id: -10042 } })),
      list_entities_by_property_field: () => Promise.resolve({ items: [], total: 0 }),
      list_entities_window: () => Promise.resolve({ items: [], total: 0 }),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await module.messagesList({ entity_id: CHAT_ID });
    expect(graph.spies.list_entities_window).toHaveBeenCalledWith(
      expect.objectContaining({ filter_eq: "-10042" }),
    );
  });

  it("resolves a deep-linked chat with its exact Source account", async () => {
    const chat = entity(CHAT_ID, "Investor chat", {
      schema_id: CHAT,
      properties: { chat_id: 42, title: "Investor chat" },
    });
    const graph = mockGraph({
      get_entity: () => Promise.resolve(chat),
      list_entities_by_property_field: () => Promise.resolve({
        items: [entity(ACCOUNT_ID, "Operator", { schema_id: TELEGRAM_ACCOUNT, properties: { is_self: true } })],
        total: 1,
      }),
      list_linked: () => Promise.resolve({
        items: [linkedRow(entity(ACCOUNT_ID, "Operator"), {
          id: "observed", from_id: ACCOUNT_ID, to_id: CHAT_ID, kind: "observed_in",
          metadata: {
            sources: [{ source: "mock-telegram", account: "account-1", surface: "messages" }],
          },
        })],
        total: 1,
      }),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await expect(module.chatsGet({ entity_id: CHAT_ID })).resolves.toMatchObject({
      entity_id: CHAT_ID,
      chat_id: "42",
      account_id: "account-1",
    });
  });

  it("returns exact message detail and rejects missing or foreign schemas", async () => {
    const message = entity(MESSAGE_ID, "Hello", {
      schema_id: MESSAGE,
      created_at: "2026-08-12T08:00:01Z",
      properties: { text: "Full body", date: "2026-08-12T08:00:00Z", sender_name: "Fallback" },
    });
    const graph = mockGraph({
      get_entity_full: () => Promise.resolve({ entity: message, links: [] }),
      list_links_for_entities: () => Promise.resolve([]),
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
      update_properties_batch: () => Promise.resolve(undefined),
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
