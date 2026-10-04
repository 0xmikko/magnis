/**
 * @layer: module
 * @test-id: tst_module_telegram_read_001
 * @scenario: scn_telegram_read_001
 * @covers: modules/telegram/module/service.ts::chatsList,messagesList,messagesGet,chatsSetIndexed
 * @deterministic: yes
 * @fixtures: fixed chat/message/account entities and strict graph doubles
 * @legacy-id: tst_be_tgread_001
 * @legacy-id: tst_be_tgread_001_read_path_served_by_plugin
 * @legacy-id: tst_be_tgread_003_set_indexed_cross_user_denied
 * @legacy-id: tst_be_tgchatmeta_001_chats_list_last_message_and_order
 */
import { describe, expect, it } from "vitest";
import type { AgentLink, Entity, Syncable } from "@magnis/sdk";
import { entity, link, linkedEntity, mockGraph, mountModule, page } from "@magnis/testkit/module";
import { CHAT, MESSAGE, TELEGRAM_ACCOUNT } from "../../schema.ts";
import { TelegramModule } from "../service.ts";

const CHAT_ID = "11111111-aaaa-4111-8111-111111111111";
const MESSAGE_ID = "22222222-aaaa-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-aaaa-4333-8333-333333333333";

function chatEntity(id: string, name: string, overrides: Parameters<typeof entity>[2]): Entity & Syncable {
  return { ...entity(id, name, overrides), syncEnabled: true, syncRevision: "0" };
}

describe("tst_module_telegram_read_001 — Telegram read mapping", () => {
  it("preserves legacy dialog fields and host order when no operator account exists", async () => {
    const pinned = chatEntity(CHAT_ID, "Investor chat", {
      schemaId: CHAT,
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
    const recent = chatEntity("chat-2", "Team", {
      schemaId: CHAT,
      properties: { chat_id: 77, title: "Team", last_message_date: "2026-08-12T09:00:00Z" },
    });
    const graph = mockGraph({
      listEntitiesByPropertyField: () => Promise.resolve(page([])),
      listEntitiesWindow: () => Promise.resolve(page([pinned, recent])),
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
    expect(graph.spies.listEntitiesWindow).toHaveBeenCalledWith({
      schema: CHAT,
      order: [
        { field: { propertyPath: "is_pinned" }, desc: true },
        { field: { propertyPath: "pin_order" }, desc: false },
        { field: { propertyPath: "last_message_date" }, desc: true },
      ],
      limit: 20,
      offset: 0,
    });
  });

  /**
   * @test-id: tst_module_telegram_read_004
   * @scenario: scn_telegram_large_dialog_list_001
   * @covers: modules/telegram/module/service.ts::chatsList,chatsGet,searchChats,observedStateFor
   * @deterministic: yes
   * @fixtures: dense-chat broad-read refusal, exact/foreign observers, numeric pins, absent self
   *
   * Test environment: Telegram module with strict Graph double
   * Clients: direct calls
   * Mocks: deterministic GraphService
   * Data: pinned and recent chats with two observer-scoped observed_in edges
   */
  it("tst_module_telegram_read_004 reads only the operator's incoming observations without traversing message history", async () => {
    const pinned = chatEntity(CHAT_ID, "Pinned", {
      schemaId: CHAT,
      properties: { chat_id: 42, title: "Pinned", last_message_date: "2026-08-12T08:00:00Z" },
    });
    const recent = chatEntity("chat-2", "Recent", {
      schemaId: CHAT,
      properties: { chat_id: 77, title: "Recent", last_message_date: "2026-08-12T09:00:00Z" },
    });
    const pinnedTen = chatEntity("chat-10", "Pinned ten", {
      schemaId: CHAT,
      properties: { chat_id: 10, title: "Pinned ten", last_message_date: "2026-08-12T10:00:00Z" },
    });
    const operator = entity(ACCOUNT_ID, "Operator", {
      schemaId: TELEGRAM_ACCOUNT,
      source: { source: "mock-telegram", account: "account-1", externalId: "tg:account:9001" },
      properties: { telegram_user_id: 9001, is_self: true },
    });
    const foreign = entity("other-account", "Other observer", { schemaId: TELEGRAM_ACCOUNT });
    let hasOperator = true;
    const graph = mockGraph({
      listEntitiesByPropertyField: () => Promise.resolve(page(hasOperator ? [operator] : [])),
      getEntity: () => Promise.resolve(pinned),
      searchEntitiesByName: () => Promise.resolve([pinned]),
      listEntitiesWindow: (spec) => {
        if (spec.filterOp === "eq") {
          return Promise.resolve(page([pinnedTen, pinned]));
        }
        return Promise.resolve(page([recent]));
      },
      listLinksForEntities: () => Promise.reject(new Error("Invalid operation: traversal exceeds maxEdges")),
      listLinksForEntity: () => Promise.reject(new Error("Invalid operation: traversal exceeds maxEdges")),
      listLinked: (spec) => Promise.resolve(page([
        linkedEntity(foreign, {
          from: foreign.id, to: spec.parentId, kind: "observed_in",
          metadata: { is_pinned: true, pin_order: -1, sources: [{ account: "foreign-account" }] },
        }),
        linkedEntity(operator, {
          from: ACCOUNT_ID, to: spec.parentId, kind: "observed_in",
          metadata: {
            is_pinned: true, pin_order: spec.parentId === CHAT_ID ? 2 : 10,
            sources: [{ account: "account-1" }],
          },
        }),
      ])),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    const result = await module.chatsList({ limit: 20, offset: 0 });

    expect(result.items.map((item) => item.chat_title)).toEqual(["Pinned", "Pinned ten", "Recent"]);
    expect(result).toMatchObject({ total: 3, limit: 20, offset: 0 });
    expect(result.items[0]).toMatchObject({ is_pinned: true, pin_order: 2, account_id: "account-1" });
    expect(graph.spies.listEntitiesWindow).toHaveBeenNthCalledWith(1, {
      schema: CHAT,
      filterField: {
        edgeKind: "observed_in",
        observerExternalId: "tg:account:9001",
        edgePath: "is_pinned",
      },
      filterOp: "eq",
      filterEq: "true",
      order: [{ field: { propertyPath: "last_message_date" }, desc: true }],
      limit: 500,
      offset: 0,
    });
    expect(graph.spies.listLinked).toHaveBeenCalledTimes(2);
    for (const chat of [pinned, pinnedTen]) {
      expect(graph.spies.listLinked).toHaveBeenCalledWith({
        parentId: chat.id, linkKind: "observed_in", direction: "in", limit: 1000, offset: 0,
      });
    }
    expect(graph.spies.listEntitiesWindow).toHaveBeenNthCalledWith(2, {
      schema: CHAT,
      filterField: {
        edgeKind: "observed_in",
        observerExternalId: "tg:account:9001",
        edgePath: "is_pinned",
      },
      filterOp: "distinct",
      filterEq: "true",
      order: [{ field: { propertyPath: "last_message_date" }, desc: true }],
      limit: 18,
      offset: 0,
    });
    await expect(module.chatsGet({ entity_id: CHAT_ID })).resolves.toMatchObject({
      is_pinned: true, pin_order: 2, account_id: "account-1",
    });
    const searched = await module.chatsList({ search: "Pinned", limit: 20, offset: 0 });
    expect(searched.items[0]).toMatchObject({ is_pinned: true, pin_order: 2, account_id: "account-1" });
    expect(graph.spies.listLinked).toHaveBeenCalledTimes(4);

    hasOperator = false;
    await expect(module.chatsGet({ entity_id: CHAT_ID })).resolves.toMatchObject({
      is_pinned: false, pin_order: null, account_id: null,
    });
    expect(graph.spies.listLinked).toHaveBeenCalledTimes(4);
    expect(graph.spies.listLinksForEntities).not.toHaveBeenCalled();
    expect(graph.spies.listLinksForEntity).not.toHaveBeenCalled();
  });

  /**
   * @test-id: tst_module_telegram_read_005
   * @scenario: scn_telegram_message_page_batch_001
   * @covers: modules/telegram/module/service.ts::messagesForChat,senderNamesFor
   * @deterministic: yes
   * @fixtures: 50 fixed messages; shared/missing authors and unrelated links
   * Test environment: real Telegram module; strict Graph double, no provider
   */
  it("tst_module_telegram_read_005 resolves a 50-message page with one author-link batch", async () => {
    const secondAuthorId = "33333333-aaaa-4333-8333-444444444444";
    const messages = Array.from({ length: 50 }, (_, index) =>
      entity(`22222222-aaaa-4222-8222-${String(index + 1).padStart(12, "0")}`, `Message ${index}`, {
        schemaId: MESSAGE,
        createdAt: "2026-08-12T08:00:01Z",
        properties: { message_id: 100 - index, text: `Message ${index}`,
          date: "2026-08-12T08:00:00Z", sender_name: "Legacy sender" },
      }));
    const links = messages.flatMap((message, index) => index % 3 === 2 ? [] : [
      link(message.id, index % 3 === 0 ? ACCOUNT_ID : secondAuthorId, "authored_by", { id: `author-${index}` }),
    ]);
    const firstMessage = messages[0];
    if (firstMessage === undefined) throw new Error("missing first message fixture");
    links.push(
      link(firstMessage.id, secondAuthorId, "authored_by", { id: "second-author" }),
      link(firstMessage.id, CHAT_ID, "in_chat", { id: "unrelated-kind" }),
      link(CHAT_ID, firstMessage.id, "authored_by", { id: "incoming" }),
    );
    let rows = messages;
    const graph = mockGraph({
      listEntitiesWindow: () => Promise.resolve(page(rows, 150)),
      listLinksForEntity: (id) => Promise.resolve(links.filter((l) => l.from === id || l.to === id)),
      listLinksForEntities: () => Promise.resolve(links),
      getEntities: () => Promise.resolve([
        entity(ACCOUNT_ID, "Alice", { schemaId: TELEGRAM_ACCOUNT }),
        entity(secondAuthorId, "Bob", { schemaId: TELEGRAM_ACCOUNT }),
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
    expect(graph.spies.listLinksForEntity).not.toHaveBeenCalled();
    expect(graph.spies.listLinksForEntities).toHaveBeenCalledTimes(1);
    expect(graph.spies.listLinksForEntities).toHaveBeenCalledWith(messages.map((message) => message.id));
    expect(graph.spies.getEntities).toHaveBeenCalledTimes(1);
    expect(graph.spies.getEntities).toHaveBeenCalledWith([ACCOUNT_ID, secondAuthorId]);
    expect(graph.spies.listEntitiesWindow).toHaveBeenCalledWith({
      schema: MESSAGE,
      filterField: { entityField: "idx" },
      filterEq: "42",
      order: [{ field: { entityField: "date" }, desc: true }],
      limit: 50,
      offset: 50,
    });
    rows = [];
    expect(await module.messagesList({ chat_id: 42, limit: 50, offset: 150 }))
      .toEqual({ items: [], total: 150, limit: 50, offset: 150 });
    expect(graph.spies.listLinksForEntities).toHaveBeenCalledTimes(1);
    expect(graph.spies.getEntities).toHaveBeenCalledTimes(1);
  });

  it("resolves an entity_id to chat_id before reading messages", async () => {
    const graph = mockGraph({
      getEntity: () =>
        Promise.resolve(chatEntity(CHAT_ID, "Chat", { schemaId: CHAT, properties: { chat_id: -10042 } })),
      listEntitiesByPropertyField: () => Promise.resolve(page([])),
      listEntitiesWindow: () => Promise.resolve(page([])),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await module.messagesList({ entity_id: CHAT_ID });
    expect(graph.spies.listEntitiesWindow).toHaveBeenCalledWith(
      expect.objectContaining({ filterEq: "-10042" }),
    );
  });

  it("resolves a deep-linked chat with its exact Source account", async () => {
    const chat = chatEntity(CHAT_ID, "Investor chat", {
      schemaId: CHAT,
      properties: { chat_id: 42, title: "Investor chat" },
    });
    const graph = mockGraph({
      findByExternalId: () => Promise.resolve(CHAT_ID),
      getEntity: () => Promise.resolve(chat),
      listEntitiesByPropertyField: () => Promise.resolve(page([
        entity(ACCOUNT_ID, "Operator", { schemaId: TELEGRAM_ACCOUNT, properties: { is_self: true } }),
      ])),
      listLinked: () => Promise.resolve(page([linkedEntity(entity(ACCOUNT_ID, "Operator"), {
        id: "observed", from: ACCOUNT_ID, to: CHAT_ID, kind: "observed_in",
        metadata: {
          sources: [{ source: "mock-telegram", account: "account-1", surface: "messages" }],
        },
      })])),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await expect(module.chatsGet({ entity_id: CHAT_ID })).resolves.toMatchObject({
      entity_id: CHAT_ID,
      chat_id: "42",
      account_id: "account-1",
    });
    await expect(module.chatsGet({ chat_id: 42 })).resolves.toMatchObject({ entity_id: CHAT_ID, chat_id: "42", account_id: "account-1" });
    expect(graph.spies.findByExternalId).toHaveBeenCalledWith("tg:chat:42");
  });

  it("returns exact message detail and rejects missing or foreign schemas", async () => {
    const message = entity(MESSAGE_ID, "Hello", {
      schemaId: MESSAGE,
      createdAt: "2026-08-12T08:00:01Z",
      properties: { text: "Full body", date: "2026-08-12T08:00:00Z", sender_name: "Fallback" },
    });
    const graph = mockGraph({
      getEntityFull: () => Promise.resolve({ entity: message, links: [] }),
      listLinksForEntities: () => Promise.resolve([]),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    await expect(module.messagesGet({ id: MESSAGE_ID })).resolves.toMatchObject({
      id: MESSAGE_ID,
      body: "Full body",
      sender: "Fallback",
      channel: "telegram",
      canonical: {},
      linkedEntities: [],
    });

    const missing = mountModule(TelegramModule, {
      graph: mockGraph({ getEntityFull: () => Promise.resolve(null) }),
    }).module;
    await expect(missing.messagesGet({ id: MESSAGE_ID })).rejects.toThrow(
      `${MESSAGE} ${MESSAGE_ID} not found`,
    );
  });

  it("updates the chat dictionary found by its external id and fails on an unknown chat", async () => {
    const graph = mockGraph({
      findByExternalId: () => Promise.resolve(CHAT_ID),
      updateProperties: () => Promise.resolve(undefined),
      updatePropertiesBatch: () => Promise.resolve(undefined),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await expect(module.chatsSetIndexed({ chat_id: 42, is_indexed: true })).resolves.toEqual({
      status: "ok",
    });
    expect(graph.spies.findByExternalId).toHaveBeenCalledWith("tg:chat:42");
    expect(graph.spies.updateProperties).toHaveBeenCalledWith({
      entityId: CHAT_ID,
      properties: { is_indexed: true },
    });

    const missing = mountModule(TelegramModule, {
      graph: mockGraph({ findByExternalId: () => Promise.resolve(null) }),
    }).module;
    await expect(missing.chatsSetIndexed({ chat_id: 42, is_indexed: false })).rejects.toThrow(
      "chat 42 not found",
    );
  });
});

/**
 * @test-id: tst_cat_entity_one_type_004
 * @scenario: scn_telegram_read_001
 * @covers: modules/telegram/module/service.ts::messagesGet
 * @deterministic: yes
 * @fixtures: one message, a canonical in_chat link and an agent link carrying confidence
 *
 * Test environment: Telegram module with strict Graph double
 * Clients: direct calls
 * Mocks: deterministic GraphService answering SDK `Link` rows
 * Data: the links the host answers read `from`/`to`; each endpoint comes back
 * as the SDK `LinkedEntitySummary`, carrying the statement of the link that
 * reached it.
 */
describe("tst_cat_entity_one_type_004 — messages.get reads SDK links and answers SDK linked summaries", () => {
  it("tst_cat_entity_one_type_004 lists the chat and an agent's watcher with their links' statements", async () => {
    const watcherId = "44444444-aaaa-4444-8444-444444444444";
    const guess: AgentLink = {
      id: "guess",
      owner: "u1",
      from: watcherId,
      to: MESSAGE_ID,
      kind: "mentions",
      createdAt: "2026-08-12T09:00:00Z",
      origin: "agent",
      confidence: 0.7,
      evidence: ["episode-1"],
      validFrom: null,
      validUntil: "2027-01-01T00:00:00Z",
    };
    const message = entity(MESSAGE_ID, "Hello", {
      schemaId: MESSAGE,
      properties: { text: "Full body", date: "2026-08-12T08:00:00Z", sender_name: "Fallback" },
    });
    const graph = mockGraph({
      getEntityFull: () => Promise.resolve({ entity: message, links: [link(MESSAGE_ID, CHAT_ID, "in_chat"), guess] }),
      listLinksForEntities: () => Promise.resolve([]),
      getEntities: () => Promise.resolve([
        entity(CHAT_ID, "Ops chat", { schemaId: CHAT, createdAt: "2026-08-01T00:00:00Z" }),
        entity(watcherId, "Watcher", { schemaId: "contacts.person", createdAt: "2026-08-02T00:00:00Z" }),
      ]),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    const view = await module.messagesGet({ id: MESSAGE_ID });

    expect(view.linkedEntities).toEqual([
      {
        id: CHAT_ID,
        name: "Ops chat",
        schemaId: CHAT,
        linkKind: "in_chat",
        createdAt: "2026-08-01T00:00:00Z",
        origin: "canonical",
        confidence: null,
        validUntil: null,
      },
      {
        id: watcherId,
        name: "Watcher",
        schemaId: "contacts.person",
        linkKind: "~mentions",
        createdAt: "2026-08-02T00:00:00Z",
        origin: "agent",
        confidence: 0.7,
        validUntil: "2027-01-01T00:00:00Z",
      },
    ]);
  });
});
