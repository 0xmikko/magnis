/**
 * @layer: module
 * @test-id: tst_module_telegram_ingest_002
 * @scenario: scn_telegram_ingest_001
 * @covers: modules/telegram/module/service.ts::onConnectionReady,ingest
 * @deterministic: yes
 * @fixtures: fixed source envelopes and strict graph doubles
 * @legacy-id: tst_be_tgingest_003_plugin_ingests_chat_and_message
 * @legacy-id: tst_be_tgbatch_020_page_dedups_sender_across_messages
 * @legacy-id: tst_be_tgingest_018_message_entity_dated_by_message_date
 * @legacy-id: tst_be_tgingest_019_reingest_reenriches_existing_message
 * @legacy-id: tst_be_tgcontact_004b_message_sender_creates_contact
 * @legacy-id: tst_be_tgcontact_004c_large_group_no_contact_but_message_stored
 * @legacy-id: tst_be_tgdelete_004d_delete_removes_entity
 * @legacy-id: tst_be_tgweb_006_message_url_creates_web_link
 * @legacy-id: tst_be_tgmedia_007_message_media_registers_file
 * @legacy-id: tst_be_tgmedia_007b_plain_message_no_file
 * @legacy-id: tst_be_tgtrigger_015
 * @legacy-id: tst_be_tgtrigger_016
 * @legacy-id: tst_kernel_link_001_leave_decays_rejoin_restores_once
 * @legacy-id: tst_be_tgidem_004_reingest_is_idempotent
 * @legacy-id: tst_be_tgidem_005_reingest_does_not_duplicate_links
 * @legacy-id: tst_be_tgiso_006_ingest_scoped_by_user
 * @legacy-id: tst_be_tgiso_008_delete_scoped_by_user
 */
import type { GraphBatchInput, JsonObject, SyncEnvelope } from "@magnis/sdk";
import { describe, expect, it } from "vitest";
import { entityId, entityRead, entityExtras, entity, link, linkedEntity, mockGraph, mountModule, page, syncStateDouble, type GraphOverrides } from "@magnis/testkit/module";
import { CHAT, MESSAGE, TELEGRAM_ACCOUNT } from "../../schema.ts";
import { TelegramModule } from "../service.ts";

function messagePayload(): JsonObject {
  return {
    entity_type: "message",
    message_id: 7,
    chat_id: 42,
    sender_id: 501,
    sender_name: "Alice",
    text: "Read https://example.test/demo",
    date: "2026-08-12T08:00:00Z",
  };
}

function messageEnvelope(kind: "snapshot" | "live" = "snapshot", payload: JsonObject = messagePayload()): SyncEnvelope {
  return {
    sourceId: "telegram-ts",
    surface: "telegram",
    accountId: "account-1",
    userId: "u1",
    identityKey: "9001",
    kind,
    remoteId: "tg:msg:42:7",
    payload,
    timestamp: "2026-08-12T08:00:01Z",
  };
}

const NOTHING_STATED = { plan: null, excluded: [] };

// These fixtures model an account whose existing chats are enabled. Stop behavior overrides admission explicitly.
const admittedGraph: GraphOverrides = {
  admitSyncEntities: (subjects) => Promise.resolve(subjects.flatMap((subject) => [...subject.remoteIds])),
  moduleSettings: () => Promise.resolve({ newChatSync: "all" }),
  listSyncMigrationEntities: () => Promise.resolve({ items: [], next: null }),
  syncState: syncStateDouble(),
};

describe("tst_module_telegram_ingest_002 — Telegram envelope mapping", () => {
  it.each([false, true])("resolves a peerless deletion within its Source account before admission (enabled: %s)", async (enabled) => {
    const stored = entity("stored-message", "Message", {
      schemaId: MESSAGE, properties: { message_id: 7 }, source: { source: "telegram-ts", account: "account-1", externalId: "tg:msg:42:7" },
    });
    const chat = { ...entity(entityId("chat-entity"), "Chat", { schemaId: CHAT, properties: { chat_id: 42, type: "private" } }), syncEnabled: enabled, syncRevision: "3" };
    const graph = mockGraph({
      findByExternalId: () => Promise.resolve(null),
      listEntitiesByPropertyField: (spec) => {
        expect(spec).toMatchObject({ entitySchema: MESSAGE, key: "message_id", value: "7" });
        return Promise.resolve(page([stored, { ...stored, id: entityId("other-account"), source: { ...stored.source, account: "account-2" } }]));
      },
      getEntityFull: (id) => {
        expect(id).toBe(stored.id);
        return Promise.resolve({ entity: stored, links: [link(stored.id, chat.id, "in_chat", { id: "parent" })] });
      },
      getEntity: () => Promise.resolve(entityRead(entity(chat.id, "Chat", { schemaId: CHAT, properties: chat.properties }), entityExtras({ syncEnabled: enabled, syncRevision: "3" }))),
      findByExternalIds: () => Promise.resolve([chat.id]),
      getEntities: () => Promise.resolve([chat]),
      admitSyncEntities: (subjects) => Promise.resolve(enabled ? subjects.flatMap((subject) => [...subject.remoteIds]) : []),
      deleteEntity: () => Promise.resolve(),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    const deletion: SyncEnvelope = { ...messageEnvelope("snapshot", { message_id: 7 }), kind: "delete", remoteId: "tg:deleted:7" };
    await expect(module.ingest({ envelopes: [deletion] })).resolves.toEqual({ droppedRemoteIds: [], triggerChecks: [], ...NOTHING_STATED });
    expect(graph.spies.admitSyncEntities).toHaveBeenCalledExactlyOnceWith([{ entityId: chat.id, remoteIds: ["tg:deleted:7"] }]);
    expect(graph.spies.deleteEntity).toHaveBeenCalledTimes(enabled ? 1 : 0);
    if (enabled) expect(graph.spies.deleteEntity).toHaveBeenCalledWith(stored.id);
  });

  it.each([false, true])("tst_module_telegram_sync_media_001 uses sync admission for messages and attachments despite the opposite legacy choice (enabled: %s)", async (syncEnabled) => {
    const graph = mockGraph({
      ...admittedGraph,
      findByExternalIds: (externalIds) => Promise.resolve(externalIds.map(() => entityId("chat-entity"))),
      getEntities: () => Promise.resolve([entity(entityId("chat-entity"), "Chat", { schemaId: CHAT, properties: { chat_id: 42, type: "private", is_indexed: !syncEnabled } })]),
      admitSyncEntities: (subjects) => Promise.resolve(syncEnabled ? subjects.flatMap((subject) => [...subject.remoteIds]) : []),
      applyBatch: (fragment) => Promise.resolve({ ids: Object.fromEntries(fragment.entities.map((item) => [item.key, entityId(`id:${item.key}`)])), created: fragment.entities.length, updated: 0, linksAdded: 0, droppedKeys: [], resolved: [] }),
      fileRegisterBatch: () => Promise.resolve(["file-id"]),
      updatePropertiesBatch: () => Promise.resolve(),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    const envelope = messageEnvelope("snapshot", { ...messagePayload(), text: "Attached", media_type: "document", source_ref: { chat_id: 42, message_id: 7 } });
    await module.ingest({ envelopes: [envelope] });
    expect(graph.spies.applyBatch).toHaveBeenCalledTimes(syncEnabled ? 1 : 0);
    if (syncEnabled) {
      expect(graph.spies.fileRegisterBatch).toHaveBeenCalledWith([expect.objectContaining({ download: true })]);
    } else {
      expect(graph.spies.fileRegisterBatch).not.toHaveBeenCalled();
      expect(graph.spies.updatePropertiesBatch).not.toHaveBeenCalled();
    }
  });

  it("rejects every queued stopped-chat event before metadata, content, membership, attachments or triggers", async () => {
    const stored = { ...entity(entityId("chat-entity"), "Stored chat", { schemaId: CHAT, properties: { chat_id: 42, type: "private" } }), syncEnabled: false, syncRevision: "4" };
    const graph = mockGraph({
      ...admittedGraph,
      findByExternalIds: (externalIds) => Promise.resolve(externalIds.map((externalId) => externalId === "tg:chat:42" ? stored.id : null)),
      getEntities: () => Promise.resolve([stored]),
      admitSyncEntities: () => Promise.resolve([]),
      applyBatch: () => Promise.reject(new Error("stopped chat must not be written")),
      deleteEntity: () => Promise.reject(new Error("stopped message must not be deleted")),
      endLink: () => Promise.reject(new Error("stopped membership must not change")),
      updatePropertiesBatch: () => Promise.reject(new Error("stopped metadata must not change")),
      fileRegisterBatch: () => Promise.reject(new Error("stopped attachment must not be registered")),
      webRegisterBatch: () => Promise.reject(new Error("stopped link must not be registered")),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    const envelopes: SyncEnvelope[] = [
      { ...messageEnvelope("live", { entity_type: "chat", chat_id: 42, title: "Overwritten", type: "private", is_pinned: true }), remoteId: "tg:chat:42" },
      messageEnvelope("live", { ...messagePayload(), media_type: "document", source_ref: { chat_id: 42, message_id: 7 } }),
      { ...messageEnvelope("live", { ...messagePayload(), message_id: 8, text: "Edited" }), remoteId: "tg:msg:42:8" },
      { ...messageEnvelope("live", { chat_id: 42 }), kind: "delete", remoteId: "tg:msg:42:9" },
      { ...messageEnvelope("live", { entity_type: "chat", chat_id: 42, telegram_user_id: 9001, valid_until: "2026-10-02T00:00:00Z" }), remoteId: "tg:membership:42" },
    ];
    await expect(module.ingest({ generation: "initial:row:1", envelopes })).resolves.toMatchObject({ droppedRemoteIds: [], triggerChecks: [], excluded: [] });
    expect(graph.spies.admitSyncEntities).toHaveBeenCalledExactlyOnceWith([{ entityId: stored.id, remoteIds: envelopes.map((item) => item.remoteId) }]);
    for (const operation of ["applyBatch", "deleteEntity", "endLink", "updatePropertiesBatch", "fileRegisterBatch", "webRegisterBatch"] as const) {
      expect(graph.spies[operation]).not.toHaveBeenCalled();
    }
  });

  it.each(["2026-08-11T08:00:00Z", "2026-08-13T08:00:00Z"])("counts a new live message once across edits and replay, preserving newer previews (%s)", async (lastMessageDate) => {
    let count = 196;
    const externalIds = new Set<string>();
    const graph = mockGraph({
      ...admittedGraph,
      findByExternalIds: (requested) => Promise.resolve(requested.map((externalId) => externalId === "tg:chat:42" ? entityId("chat-entity") : externalIds.has(externalId) ? `id:${externalId}` : null)),
      getEntities: () => Promise.resolve([entity(entityId("chat-entity"), "Chat", {
        schemaId: CHAT, properties: { chat_id: 42, type: "private", message_count: count, last_message_date: lastMessageDate },
      })]),
      applyBatch: (fragment) => {
        for (const item of fragment.entities) if (item.externalId !== null) externalIds.add(item.externalId);
        return Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, entityId(`id:${item.key}`)])),
          created: fragment.entities.length, updated: 0, linksAdded: 0, droppedKeys: [], resolved: [],
        });
      },
      webRegisterBatch: (links) => Promise.resolve(links.map(() => "web-id")),
      updatePropertiesBatch: (updates) => {
        for (const { properties } of updates) {
          if (properties !== null && typeof properties === "object" && !Array.isArray(properties) && typeof properties.message_count === "number") {
            count = properties.message_count;
          }
        }
        return Promise.resolve(undefined);
      },
    });
    const module = mountModule(TelegramModule, { graph }).module;
    const live = messageEnvelope("live");
    await module.ingest({ envelopes: [live] });
    expect(count).toBe(197);
    const edited = messageEnvelope("live", { ...messagePayload(), text: "Edited message" });
    await module.ingest({ envelopes: [edited] });
    expect(count).toBe(197);
    await module.ingest({ envelopes: [edited] });
    expect(count).toBe(197);
    expect(graph.spies.updatePropertiesBatch).toHaveBeenCalledWith([{
      entityId: entityId("chat-entity"), properties: lastMessageDate > "2026-08-12T08:00:00Z" ? { message_count: 197 } : {
        message_count: 197, last_message_date: "2026-08-12T08:00:00Z",
        last_message_preview: "Read https://example.test/demo", last_sender_name: "Alice",
      },
    }]);
  });

  it("mints the provider-verified self account on connection ready", async () => {
    const graph = mockGraph({
      ...admittedGraph,
      applyBatch: () =>
        Promise.resolve({ ids: { self: entityId("self-id") }, created: 1, updated: 0, linksAdded: 0, droppedKeys: [], resolved: [] }),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await expect(
      module.onConnectionReady({ userId: "u1", sourceId: "telegram-ts", accountId: "a1", identityKey: "9001" }),
    ).resolves.toBeUndefined();
    expect(graph.spies.applyBatch).toHaveBeenCalledWith({
      entities: [{
        key: "self",
        schemaId: TELEGRAM_ACCOUNT,
        name: "",
        idx: null,
        date: null,
        externalId: "tg:account:9001",
        properties: { telegram_user_id: 9001, is_self: true },
      }],
      refs: [],
      links: [],
    });
  });

  it("refuses unstamped identity-scoped envelopes before graph access", async () => {
    const { identityKey: _stamped, ...envelope } = messageEnvelope();
    const module = mountModule(TelegramModule, { graph: mockGraph() }).module;

    await expect(module.ingest({ envelopes: [envelope] })).rejects.toThrow(
      "envelope carries no identityKey",
    );
  });

  /**
   * @test-id: tst_module_telegram_003
   * @scenario: scn_telegram_ingest_001
   * @covers: TelegramModule.ingestChatBatch
   * @deterministic: yes
   * @fixtures: one host-stamped chat envelope without a prior connection-ready hook
   */
  it("tst_module_telegram_003 atomically creates the observer before its chat membership", async () => {
    const graph = mockGraph({
      ...admittedGraph,
      getEntities: (ids) => Promise.resolve(ids.map((id) => entity(id, "Chat", { schemaId: CHAT, properties: { chat_id: 42 } }))),
      findByExternalId: () => Promise.resolve(entityId("self-id")),
      listLinked: () => Promise.resolve(page([])),
      findByExternalIds: (externalIds) => Promise.resolve(externalIds.map(() => null)),
      applyBatch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, entityId(`id:${item.key}`)])),
          created: fragment.entities.length,
          updated: 0,
          linksAdded: fragment.links.length,
          droppedKeys: [], resolved: [],
        }),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    const chat: SyncEnvelope = {
      ...messageEnvelope("snapshot", { entity_type: "chat", chat_id: 42, title: "Magnis Builders" }),
      remoteId: "tg:chat:42",
    };

    await expect(module.ingest({ envelopes: [chat] })).resolves.toEqual({
      droppedRemoteIds: [],
      triggerChecks: [],
      ...NOTHING_STATED,
    });
    expect(graph.spies.applyBatch).toHaveBeenCalledWith({
      entities: expect.arrayContaining([
        expect.objectContaining({
          key: "self",
          schemaId: TELEGRAM_ACCOUNT,
          externalId: "tg:account:9001",
        }),
        expect.objectContaining({
          key: "tg:chat:42",
          schemaId: CHAT,
          externalId: "tg:chat:42",
        }),
      ]),
      refs: [],
      links: [{
        fromKey: "self",
        toKey: "tg:chat:42",
        kind: "observed_in",
        confidence: null,
        metadata: {},
        declaredBy: "tg:chat:42",
        validFrom: null,
        validUntil: null,
      }],
    });
  });

  it("maps message/account nodes and structural links in one batch", async () => {
    const graph = mockGraph({
      ...admittedGraph,
      findByExternalIds: (externalIds) => Promise.resolve(externalIds.map(() => entityId("chat-entity"))),
      getEntities: (ids) =>
        Promise.resolve(ids.map((id) => entity(id, "Chat", { schemaId: CHAT, properties: { chat_id: 42, type: "private" } }))),
      applyBatch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, entityId(`id:${item.key}`)])),
          created: fragment.entities.length,
          updated: 0,
          linksAdded: fragment.links.length,
          droppedKeys: [], resolved: [],
        }),
      webRegister: () => Promise.resolve("web-id"),
      webRegisterBatch: (links: readonly unknown[]) => Promise.resolve(links.map(() => "web-id")),
      updateProperties: () => Promise.resolve(undefined),
      updatePropertiesBatch: () => Promise.resolve(undefined),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    const result = await module.ingest({ envelopes: [messageEnvelope()] });

    expect(result).toEqual({ droppedRemoteIds: [], triggerChecks: [], ...NOTHING_STATED });
    const applyBatch = graph.spies.applyBatch;
    if (applyBatch === undefined) throw new Error("telegram ingest: applyBatch spy missing");
    const fragment = applyBatch.mock.calls[0]?.[0] as GraphBatchInput;
    expect(fragment.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "tg:msg:42:7",
        schemaId: MESSAGE,
        idx: "42",
        date: "2026-08-12T08:00:00Z",
        properties: expect.not.objectContaining({ chat_id: expect.anything(), sender_id: expect.anything() }),
      }),
      expect.objectContaining({ key: "acct:501", schemaId: TELEGRAM_ACCOUNT, externalId: "tg:account:501" }),
    ]));
    expect(fragment.refs).toContainEqual({ key: "chat:42", externalId: "tg:chat:42" });
    expect(fragment.links.map((link) => `${link.fromKey}:${link.kind}:${link.toKey}`)).toEqual([
      "tg:msg:42:7:in_chat:chat:42",
      "tg:msg:42:7:authored_by:acct:501",
      "acct:501:observed_participant:chat:42",
    ]);
    expect(graph.spies.webRegisterBatch).toHaveBeenCalledWith([expect.objectContaining({
      url: "https://example.test/demo",
      parentEntityId: entityId("id:tg:msg:42:7"),
      linkKind: "references",
    })]);
  });

  /**
   * @test-id: tst_module_telegram_005
   * @scenario: scn_telegram_unicode_title_001
   * @covers: TelegramModule.ingestMessageBatch
   * @deterministic: yes
   * @fixtures: odd ASCII prefix with emoji, emoji-only, and ASCII message bodies
   */
  it("tst_module_telegram_005 truncates titles at complete code points without changing message bodies", async () => {
    const graph = mockGraph({
      ...admittedGraph,
      findByExternalIds: (externalIds) => Promise.resolve(externalIds.map((externalId) => externalId === "tg:chat:42" ? entityId("chat-entity") : null)),
      getEntities: () => Promise.resolve([entity(entityId("chat-entity"), "Chat", { schemaId: CHAT, properties: { chat_id: 42, type: "private" } })]),
      updatePropertiesBatch: () => Promise.resolve(),
      applyBatch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, entityId(`id:${item.key}`)])),
          created: fragment.entities.length,
          updated: 0,
          linksAdded: fragment.links.length,
          droppedKeys: [], resolved: [],
        }),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    const variants = [
      { text: `${"x".repeat(79)}😀 suffix`, name: `${"x".repeat(79)}😀` },
      { text: "😀".repeat(81), name: "😀".repeat(80) },
      { text: "x".repeat(81), name: "x".repeat(80) },
    ];
    const payloads = variants.map(({ text }, index) => ({ ...messagePayload(), message_id: index + 7, text }));
    const envelopes = payloads.map((payload) => ({
      ...messageEnvelope("snapshot", payload),
      remoteId: `tg:msg:42:${String(payload.message_id)}`,
    }));

    await expect(module.ingest({ envelopes })).resolves.toEqual({ droppedRemoteIds: [], triggerChecks: [], ...NOTHING_STATED });

    const applyBatch = graph.spies.applyBatch;
    if (applyBatch === undefined) throw new Error("telegram ingest: applyBatch spy missing");
    expect(applyBatch).toHaveBeenCalledTimes(1);
    const fragment = applyBatch.mock.calls[0]?.[0] as GraphBatchInput | undefined;
    expect(fragment?.entities.filter(({ schemaId }) => schemaId === MESSAGE).map(({ name, properties }) => ({
      name,
      text: properties !== null && typeof properties === "object" && !Array.isArray(properties) ? properties.text : undefined,
    }))).toEqual(variants);
    expect(payloads.map(({ text }) => text)).toEqual(variants.map(({ text }) => text));
  });

  /**
   * @test-id: tst_module_telegram_004
   * @scenario: scn_telegram_backfill_throughput_001
   * @covers: TelegramModule.ingest
   * @deterministic: yes
   * @fixtures: one 1001-message page
   */
  it("tst_module_telegram_004 admits a 1001-message page in one graph batch", async () => {
    const messageCount = 1_001;
    const graph = mockGraph({
      ...admittedGraph,
      findByExternalIds: (externalIds) => Promise.resolve(externalIds.map(() => entityId("chat-entity"))),
      getEntities: (ids) =>
        Promise.resolve(ids.map((id) => entity(id, "Chat", {
          schemaId: CHAT,
          properties: { chat_id: 42, type: "private" },
        }))),
      applyBatch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, entityId(`id:${item.key}`)])),
          created: fragment.entities.length,
          updated: 0,
          linksAdded: fragment.links.length,
          droppedKeys: [], resolved: [],
        }),
      updateProperties: () => Promise.resolve(undefined),
      updatePropertiesBatch: () => Promise.resolve(undefined),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    const envelopes = Array.from({ length: messageCount }, (_, index) => ({
      ...messageEnvelope("snapshot", { ...messagePayload(), message_id: index + 1, text: "plain text" }),
      remoteId: `tg:msg:42:${String(index + 1)}`,
    }));

    await module.ingest({ envelopes });

    expect(graph.spies.findByExternalIds).toHaveBeenCalledTimes(1);
    expect(graph.spies.getEntities).toHaveBeenCalledTimes(1);
    expect(graph.spies.applyBatch).toHaveBeenCalledTimes(1);
    expect(graph.spies.updatePropertiesBatch).toHaveBeenCalledTimes(1);
  });

  it("preserves the provider-verified self marker when an outgoing sender replica converges", async () => {
    const outgoing = messageEnvelope("snapshot", { ...messagePayload(), sender_id: 9001, sender_name: "Operator" });
    const graph = mockGraph({
      ...admittedGraph,
      findByExternalIds: (externalIds) => Promise.resolve(externalIds.map(() => entityId("chat-entity"))),
      getEntities: (ids) =>
        Promise.resolve(ids.map((id) => entity(id, "Chat", {
          schemaId: CHAT,
          properties: { chat_id: 42, type: "private" },
        }))),
      applyBatch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, entityId(`id:${item.key}`)])),
          created: fragment.entities.length,
          updated: 0,
          linksAdded: fragment.links.length,
          droppedKeys: [], resolved: [],
        }),
      webRegister: () => Promise.resolve("web-id"),
      webRegisterBatch: (links: readonly unknown[]) => Promise.resolve(links.map(() => "web-id")),
      updateProperties: () => Promise.resolve(undefined),
      updatePropertiesBatch: () => Promise.resolve(undefined),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await module.ingest({ envelopes: [outgoing] });

    const applyBatch = graph.spies.applyBatch;
    if (applyBatch === undefined) throw new Error("telegram ingest: applyBatch spy missing");
    const fragment = applyBatch.mock.calls[0]?.[0];
    expect(fragment?.entities).toContainEqual(expect.objectContaining({
      key: "acct:9001",
      externalId: "tg:account:9001",
      properties: expect.objectContaining({ telegram_user_id: 9001, is_self: true }),
    }));
  });

  it("drops identity-less messages within a valid page and emits checks only for live messages", async () => {
    const { message_id: _messageId, ...withoutMessageId } = messagePayload();
    const invalid = { ...messageEnvelope("snapshot", withoutMessageId), remoteId: "tg:msg:42:missing" };
    const live = messageEnvelope("live");
    const graph = mockGraph({
      ...admittedGraph,
      // The live message's chat is already known to the graph.
      findByExternalIds: (externalIds) => Promise.resolve(externalIds.map((externalId) => (externalId === "tg:chat:42" ? entityId("chat-entity-42") : null))),
      applyBatch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, entityId(`id:${item.key}`)])),
          created: fragment.entities.length,
          updated: 0,
          linksAdded: fragment.links.length,
          droppedKeys: [], resolved: [],
        }),
      webRegister: () => Promise.resolve("web-id"),
      webRegisterBatch: (links: readonly unknown[]) => Promise.resolve(links.map(() => "web-id")),
      // The live message's chat is known with Telegram's count; the message
      // raises it by one so the plan and the saved count move together.
      getEntities: (ids) => Promise.resolve(ids.map((id) => entity(id, "Chat 42", {
        schemaId: CHAT,
        properties: { chat_id: 42, title: "Chat 42", type: "private", message_count: 99 },
      }))),
      updateProperties: () => Promise.resolve(),
      updatePropertiesBatch: () => Promise.resolve(),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    const result = await module.ingest({ envelopes: [invalid, live] });
    expect(graph.spies.updatePropertiesBatch).toHaveBeenCalledWith([expect.objectContaining({
      properties: expect.objectContaining({ message_count: 100 }),
    })]);
    expect(result).toEqual({
      ...NOTHING_STATED,
      droppedRemoteIds: ["tg:msg:42:missing"],
      triggerChecks: [expect.objectContaining({
        type: "trigger.check",
        phase: "live",
        entityId: entityId("id:tg:msg:42:7"),
        userId: "u1",
        context: {
          text: "Read https://example.test/demo",
          sender_name: "Alice",
          // The backend fires only for events that say when they happened (INV-10).
          occurred_at: "2026-08-12T08:00:00Z",
        },
      })],
    });
  });

  it("deletes by remote external id and reports failed deletes instead of aborting the page", async () => {
    const envelope: SyncEnvelope = {
      ...messageEnvelope("snapshot", {}),
      kind: "delete",
    };
    const graph = mockGraph({
      ...admittedGraph,
      findByExternalIds: (externalIds) => Promise.resolve(externalIds.map(() => entityId("chat-entity"))),
      getEntities: () => Promise.resolve([entity(entityId("chat-entity"), "Chat", { schemaId: CHAT, properties: { chat_id: 42 } })]),
      getEntity: () => Promise.resolve(entityRead(entity(entityId("chat-entity"), "Chat", { schemaId: CHAT, properties: { chat_id: 42 } }), entityExtras({ syncEnabled: true, syncRevision: "0" }))),
      getEntityFull: () => Promise.resolve({ entity: entity(entityId("message-entity"), "Message", { schemaId: MESSAGE }), links: [link(entityId("message-entity"), entityId("chat-entity"), "in_chat", { id: "parent" })] }),
      findByExternalId: () => Promise.resolve(entityId("message-entity")),
      deleteEntity: () => Promise.resolve(undefined),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    await expect(module.ingest({ envelopes: [envelope] })).resolves.toEqual({
      droppedRemoteIds: [],
      triggerChecks: [],
      ...NOTHING_STATED,
    });
    expect(graph.spies.deleteEntity).toHaveBeenCalledWith(entityId("message-entity"));

    const failing = mountModule(TelegramModule, {
      graph: mockGraph({
        ...admittedGraph,
        findByExternalIds: (externalIds) => Promise.resolve(externalIds.map(() => entityId("chat-entity"))),
        getEntities: () => Promise.resolve([entity(entityId("chat-entity"), "Chat", { schemaId: CHAT, properties: { chat_id: 42 } })]),
        getEntity: () => Promise.resolve(entityRead(entity(entityId("chat-entity"), "Chat", { schemaId: CHAT, properties: { chat_id: 42 } }), entityExtras({ syncEnabled: true, syncRevision: "0" }))),
        getEntityFull: () => Promise.resolve({ entity: entity(entityId("message-entity"), "Message", { schemaId: MESSAGE }), links: [link(entityId("message-entity"), entityId("chat-entity"), "in_chat", { id: "parent" })] }),
        findByExternalId: () => Promise.resolve(entityId("message-entity")),
        deleteEntity: () => Promise.reject(new Error("delete failed")),
      }),
    }).module;
    await expect(failing.ingest({ envelopes: [envelope] })).resolves.toEqual({
      droppedRemoteIds: ["tg:msg:42:7"],
      triggerChecks: [],
      ...NOTHING_STATED,
    });
  });

  /**
   * @test-id: tst_module_telegram_007
   * @scenario: scn_tg_membership_001
   * @covers: TelegramModule.ingest membership-end branch
   * @deterministic: yes
   * @fixtures: one active observed_in edge and fixed live membership envelopes
   * Test environment: mounted Telegram module with a strict graph double
   * Clients: direct module calls
   * Mocks: GraphService only
   * Data: provider identity 9001, chat 42, fixed Telegram server timestamp
   */
  it("tst_module_telegram_007 ends only the stamped identity's active edge at the provider time", async () => {
    let validUntil: string | null = null;
    let selfExists = true;
    let chatExists = true;
    let edgeExists = true;
    let endError: Error | null = null;
    const graph = mockGraph({
      ...admittedGraph,
      findByExternalIds: (externalIds) => Promise.resolve(externalIds.map(() => entityId("chat-entity"))),
      getEntities: () => Promise.resolve([entity(entityId("chat-entity"), "Chat", { schemaId: CHAT, properties: { chat_id: 42 } })]),
      findByExternalId: (externalId) => {
        if (externalId === "tg:account:9001") return Promise.resolve(selfExists ? entityId("self-id") : null);
        if (externalId === "tg:chat:42") return Promise.resolve(chatExists ? entityId("chat-id") : null);
        return Promise.resolve(null);
      },
      listLinked: () => Promise.resolve(page(edgeExists ? [linkedEntity(entity(entityId("self-id"), "Me"), {
        id: "edge-42", from: entityId("self-id"), to: entityId("chat-id"), kind: "observed_in", validUntil, metadata: null,
      })] : [])),
      endLink: (_id, endedAt) => {
        if (endError !== null) return Promise.reject(endError);
        validUntil = endedAt;
        return Promise.resolve(undefined);
      },
      applyBatch: () => Promise.resolve({
        ids: {}, created: 0, updated: 0, linksAdded: 0, droppedKeys: [], resolved: [],
      }),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    const departurePayload: JsonObject = {
      entity_type: "telegram_chat",
      chat_id: 42,
      top_message: 0,
      telegram_user_id: 9001,
      valid_until: "2026-09-20T11:22:33+00:00",
    };
    const departureWith = (payload: JsonObject): SyncEnvelope => ({
      ...messageEnvelope("live", payload),
      remoteId: "tg:chat:42",
    });
    const departure = departureWith(departurePayload);

    await expect(module.ingest({ envelopes: [departure] })).resolves.toMatchObject({
      droppedRemoteIds: [], triggerChecks: [],
    });
    expect(graph.spies.endLink).toHaveBeenCalledTimes(1);
    expect(graph.spies.endLink).toHaveBeenCalledWith("edge-42", "2026-09-20T11:22:33+00:00");
    expect(graph.spies.applyBatch).not.toHaveBeenCalled();

    await module.ingest({ envelopes: [departure] });
    validUntil = null;
    await module.ingest({
      envelopes: [departureWith({ ...departurePayload, telegram_user_id: 7002 })],
    });
    expect(graph.spies.endLink).toHaveBeenCalledTimes(1);

    for (const field of ["telegram_user_id", "chat_id", "valid_until"] as const) {
      const payload = Object.fromEntries(Object.entries(departurePayload).filter(([key]) => key !== field));
      await expect(module.ingest({
        envelopes: [departureWith(payload)],
      })).rejects.toThrow(field);
    }
    await expect(module.ingest({
      envelopes: [departureWith({ ...departurePayload, valid_until: "not-a-date" })],
    })).rejects.toThrow("valid_until");
    await expect(module.ingest({
      envelopes: [departureWith({ ...departurePayload, valid_until: "2026-09-20T11:22:33" })],
    })).rejects.toThrow("valid_until");

    selfExists = false;
    await module.ingest({ envelopes: [departure] });
    selfExists = true;
    chatExists = false;
    await module.ingest({ envelopes: [departure] });
    chatExists = true;
    validUntil = "2026-09-20T11:22:33+00:00";
    await module.ingest({ envelopes: [departure] });
    validUntil = null;
    edgeExists = false;
    await module.ingest({ envelopes: [departure] });
    edgeExists = true;
    expect(graph.spies.endLink).toHaveBeenCalledTimes(1);

    endError = new Error("graph write failed");
    await expect(module.ingest({ envelopes: [departure] })).rejects.toThrow("graph write failed");
  });
  /**
   * @test-id: tst_module_telegram_006
   * @scenario: scn_telegram_ingest_001
   * @covers: TelegramModule.ingestChatBatch, TelegramModule.ingestMessageBatch
   * @deterministic: yes
   * @fixtures: one packet of three chat snapshots and two messages; three chats already in the graph
   */
  it("tst_module_telegram_006 batches existing chat reads and reads the required fields of newly created chats", async () => {
    const known: Record<string, string> = { "tg:chat:1": entityId("chat-1"), "tg:chat:2": entityId("chat-2"), "tg:chat:4": entityId("chat-4") };
    const stored: Record<string, JsonObject> = {
      [entityId("chat-1")]: { chat_id: 1, title: "One", avatar_url: "/a/1.jpg" },
      [entityId("chat-2")]: { chat_id: 2, title: "Two", last_message_preview: "kept two", last_sender_name: "Kept" },
      [entityId("chat-4")]: { chat_id: 4, title: "Four", last_message_date: "2026-08-01T00:00:00Z" },
    };
    const graph = mockGraph({
      ...admittedGraph,
      findByExternalIds: (externalIds) => Promise.resolve(externalIds.map((externalId) => known[externalId] ?? null)),
      getEntities: (ids) => Promise.resolve(ids.map((id) => entity(id, String(stored[id]?.title ?? ""), {
        schemaId: CHAT,
        properties: stored[id] ?? {},
      }))),
      findByExternalId: (externalId) => externalId === "tg:account:9001"
        ? Promise.resolve(entityId("self-id"))
        : Promise.reject(new Error("per-chat external id lookup is forbidden")),
      listLinked: () => Promise.resolve(page([])),
      getEntity: () => Promise.reject(new Error("per-chat entity lookup is forbidden")),
      listEntitiesWindow: () => Promise.reject(new Error("whole-account chat scan is forbidden")),
      updateProperties: () => Promise.resolve(),
      updatePropertiesBatch: () => Promise.resolve(),
      applyBatch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, entityId(`id:${item.key}`)])),
          created: 0,
          updated: fragment.entities.length,
          linksAdded: fragment.links.length,
          droppedKeys: [], resolved: [],
        }),
    });
    const module = mountModule(TelegramModule, { graph, ctx: { extensionId: "telegram" } }).module;
    const chat = (chatId: number): SyncEnvelope => ({
      ...messageEnvelope("snapshot", { entity_type: "chat", chat_id: chatId, title: `Chat ${String(chatId)}` }),
      remoteId: `tg:chat:${String(chatId)}`,
    });
    const message = (chatId: number, id: number): SyncEnvelope => ({
      ...messageEnvelope("snapshot", { ...messagePayload(), message_id: id, chat_id: chatId, text: "plain text" }),
      remoteId: `tg:msg:${String(chatId)}:${String(id)}`,
    });

    await expect(module.ingest({
      envelopes: [chat(1), chat(2), chat(3), message(1, 8), message(4, 9)],
    })).resolves.toEqual({ droppedRemoteIds: [], triggerChecks: [], ...NOTHING_STATED });

    expect(graph.spies.findByExternalIds?.mock.calls).toEqual([[["tg:chat:1", "tg:chat:2", "tg:chat:3", "tg:chat:4"]]]);
    expect(graph.spies.getEntities?.mock.calls).toEqual([[[entityId("chat-1"), entityId("chat-2"), entityId("chat-4")]]]);
    // One operator lookup for the admitted snapshots; the newly discovered chat now has an observer edge too.
    expect(graph.spies.findByExternalId?.mock.calls).toEqual([["tg:account:9001"]]);
    expect(graph.spies.listLinked?.mock.calls.map(([spec]) => (spec as { parentId: string }).parentId)).toEqual([entityId("chat-1"), entityId("chat-2"), entityId("id:tg:chat:3")]);
    expect(graph.spies.getEntity).not.toHaveBeenCalled();
    expect(graph.spies.listEntitiesWindow).not.toHaveBeenCalled();
    const firstBatch = graph.spies.applyBatch?.mock.calls[1]?.[0] as GraphBatchInput | undefined;
    expect(firstBatch?.entities.find((item) => item.key === "tg:chat:2")?.properties).toMatchObject({
      last_message_preview: "kept two",
      last_sender_name: "Kept",
    });
    expect(firstBatch?.entities.find((item) => item.key === "tg:chat:1")?.properties).toMatchObject({ avatar_url: "/a/1.jpg" });
    expect(firstBatch?.entities.find((item) => item.key === "tg:chat:3")?.properties).toEqual({ chat_id: 3, title: "Chat 3" });
    expect(graph.spies.updatePropertiesBatch).toHaveBeenCalledTimes(1);
  });
});
