/**
 * @layer: module
 * @test-id: tst_module_telegram_plan_001
 * @scenario: scn_telegram_sync_plan_001
 * @covers: modules/telegram/module/service.ts::ingest (plan, excluded)
 * @deterministic: yes
 * @fixtures: seven chats with fixed counts, pins and indexing choices; an in-memory graph double
 *
 * The plan grows out of the pages: for every chat a page carries, the module
 * states that chat's count relative to the statement it keeps on the
 * operator's observed_in edge — in full on a new pass, zero for a re-read,
 * the difference for a restatement, one for a live message — and names the
 * chats it leaves out of history. Snapshot omission does not end membership.
 */
import type { CanonicalEntity, CanonicalLink, EntityRead, PersistentEntity, PersistentEntityId, GraphBatchInput, JsonObject, JsonValue, Syncable, SyncEnvelope, SyncMigrationEntity, WindowSpec } from "@magnis/sdk";
import { describe, expect, it } from "vitest";
import { entity, entityRead, entityExtras, entityId, link, linkedEntity, mockGraph, mountModule, page, syncStateDouble } from "@magnis/testkit/module";
import { CHAT, MESSAGE } from "../../schema.ts";
import { TelegramModule } from "../service.ts";

const SELF = "tg:account:9001";
const FIRST = "initial:row:1";
const SECOND = "initial:row:2";

interface ChatFixture { readonly id: number; readonly title: string; readonly props: JsonObject }
const chats: readonly ChatFixture[] = [
  { id: 1, title: "Private", props: { type: "private", message_count: 1200 } },
  { id: 2, title: "Small group", props: { type: "group", member_count: 40, message_count: 300 } },
  { id: 3, title: "Large channel", props: { type: "supergroup", member_count: 5000, message_count: 886287 } },
  { id: 4, title: "Large but forced on", props: { type: "supergroup", member_count: 900, message_count: 7000, is_indexed: true } },
  { id: 5, title: "Private but forced off", props: { type: "private", message_count: 20, is_indexed: false } },
  { id: 6, title: "Never counted", props: { type: "group", member_count: 10 } },
  { id: 7, title: "Pinned large channel", props: { type: "supergroup", member_count: 3000, message_count: 100, is_pinned: true } },
];

function chatEnvelope(chat: ChatFixture, over: JsonObject = {}): SyncEnvelope {
  return {
    sourceId: "telegram-ts", surface: "telegram", accountId: "account-1", userId: "u1", identityKey: "9001",
    kind: "snapshot", remoteId: `tg:chat:${String(chat.id)}`, timestamp: "2026-09-02T00:00:00Z",
    payload: { entity_type: "chat", chat_id: chat.id, title: chat.title, ...chat.props, ...over },
  };
}

function liveMessage(chatId: number, messageId: number, text = "hi"): SyncEnvelope {
  return {
    sourceId: "telegram-ts", surface: "telegram", accountId: "account-1", userId: "u1", identityKey: "9001",
    kind: "live", remoteId: `tg:msg:${String(chatId)}:${String(messageId)}`, timestamp: "2026-09-02T00:00:00Z",
    payload: { entity_type: "message", message_id: messageId, chat_id: chatId, sender_id: 501, sender_name: "Alice", text, date: "2026-09-02T00:00:00Z" },
  };
}

/** A JSON object's keys, or none for any other JSON. */
function keysOf(value: JsonValue | undefined): JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function storedRead(row: PersistentEntity & Syncable): EntityRead {
  const { syncEnabled, syncRevision, ...record } = row;
  return entityRead(record, entityExtras({ syncEnabled, syncRevision }));
}

/** The Graph as the module leaves it: chats by external id, the operator's edges by chat. */
class Store {
  readonly chatsByExternalId = new Map<string, PersistentEntity & Syncable>();
  newChatSync = "current";
  readonly edgesByChat = new Map<string, CanonicalLink>();
  readonly messagesByExternalId = new Map<string, string>();
  readonly endedAt: [string, string][] = [];
  windows: string[] = [];

  chatOf(id: string): PersistentEntity & Syncable | undefined {
    return [...this.chatsByExternalId.values()].find((chat) => chat.id === id);
  }

  graph(): ReturnType<typeof mockGraph> {
    return mockGraph({
      moduleSettings: () => Promise.resolve({ newChatSync: this.newChatSync }),
      admitSyncEntities: (subjects) => Promise.resolve(subjects.flatMap((subject) => this.chatOf(subject.entityId)?.syncEnabled === true ? [...subject.remoteIds] : [])),
      findByExternalId: (externalId) => Promise.resolve(externalId === SELF ? entityId("self-id") : this.chatsByExternalId.get(externalId)?.id ?? null),
      findByExternalIds: (externalIds) => Promise.resolve(externalIds.map((externalId) => this.chatsByExternalId.get(externalId)?.id ?? this.messagesByExternalId.get(externalId) ?? null)),
      getEntities: (ids, options) => Promise.resolve(ids.flatMap((id) => { const chat = this.chatOf(id); if (chat === undefined) return []; const read = storedRead(chat); return [options?.extras === true ? read : read.entity]; })),
      listLinked: (spec) => {
        expect(spec).toMatchObject({ linkKind: "observed_in", direction: "in" });
        const edge = this.edgesByChat.get(spec.parentId);
        const self = entity(entityId("self-id"), "Me", { schemaId: "telegram.account", source: { source: "test", account: "a1", externalId: SELF } });
        return Promise.resolve(page(edge === undefined ? [] : [linkedEntity(self, edge)]));
      },
      applyBatch: (fragment: GraphBatchInput) => {
        const ids: Record<string, PersistentEntityId> = {};
        for (const item of fragment.entities) {
          const id = item.key === "self" ? entityId("self-id") : entityId(`id:${item.key}`);
          ids[item.key] = id;
          if (item.schemaId === MESSAGE && item.externalId !== null) this.messagesByExternalId.set(item.externalId, id);
          if (item.schemaId === CHAT && item.externalId !== null) {
            const known = this.chatsByExternalId.get(item.externalId);
            const initial = "syncEnabled" in item && typeof item.syncEnabled === "boolean" ? item.syncEnabled : undefined;
            const syncEnabled = known === undefined ? initial : known.syncEnabled;
            if (syncEnabled === undefined) throw new Error("new chat requires a synchronization choice");
            this.chatsByExternalId.set(item.externalId, {
              ...entity(id, item.name ?? "", {
                schemaId: CHAT,
                source: { source: "test", account: "a1", externalId: item.externalId },
                properties: { ...keysOf(known?.properties), ...keysOf(item.properties ?? undefined) },
              }),
              syncEnabled,
              syncRevision: known?.syncRevision ?? "0",
            });
          }
        }
        for (const link of fragment.links) {
          if (link.kind !== "observed_in") continue;
          const refExternalId = fragment.refs.find((ref) => ref.key === link.toKey)?.externalId;
          const chatId = ids[link.toKey] ?? (refExternalId === undefined || refExternalId === null ? undefined : this.chatsByExternalId.get(refExternalId)?.id);
          if (chatId === undefined) throw new Error(`observed_in link to unknown chat ${link.toKey}`);
          const known = this.edgesByChat.get(chatId);
          this.edgesByChat.set(chatId, {
            id: `edge:${chatId}`, owner: "u1", from: entityId("self-id"), to: chatId, kind: "observed_in", createdAt: "2026-09-02T00:00:00Z",
            origin: "canonical", validFrom: known?.validFrom ?? null, validUntil: known?.validUntil ?? null, metadata: link.metadata,
          });
        }
        return Promise.resolve({ ids, created: fragment.entities.length, updated: 0, linksAdded: fragment.links.length, droppedKeys: [], resolved: [] });
      },
      updateProperties: () => Promise.resolve(),
      updatePropertiesBatch: () => Promise.resolve(),
      endLink: (id, validUntil) => {
        this.endedAt.push([id, validUntil]);
        for (const edge of this.edgesByChat.values()) if (edge.id === id) edge.validUntil = validUntil;
        return Promise.resolve();
      },
      listEntitiesWindow: (spec: WindowSpec) => {
        expect(spec.limit).toBeLessThanOrEqual(500);
        expect(spec.filterField).toEqual({ edgeKind: "observed_in", observerExternalId: SELF, edgePath: "sync_pass" });
        this.windows.push(spec.filterOp ?? "eq");
        // "distinct" is IS DISTINCT FROM: an unstamped edge, or no edge at all, is kept.
        const rows = [...this.chatsByExternalId.values()].filter((chat) => {
          const pass = keysOf(this.edgesByChat.get(chat.id)?.metadata).sync_pass;
          return spec.filterOp === "distinct" ? pass !== spec.filterEq : pass === spec.filterEq;
        });
        return Promise.resolve(page(rows.slice(spec.offset, spec.offset + spec.limit).map((row) => { const read = storedRead(row); return spec.extras === true ? read : read.entity; }), rows.length));
      },
    });
  }
}

const zero = { [CHAT]: { total: 0, skipped: 0 }, [MESSAGE]: { total: 0, skipped: 0 } };

describe("tst_module_telegram_plan_001 — the module states its plan from the pages", () => {
  it("applies creation settings only to missing chats and preserves Stop across rediscovery", async () => {
    const store = new Store();
    const module = mountModule(TelegramModule, { graph: store.graph() }).module;
    const first = chats[0];
    if (first === undefined) throw new Error("fixture");
    await module.ingest({ generation: FIRST, envelopes: [chatEnvelope(first)] });
    store.newChatSync = "none";
    const second = { id: 10, title: "New DM", props: { type: "private", is_pinned: true } };
    await module.ingest({ generation: FIRST, envelopes: [chatEnvelope(first), chatEnvelope(second)] });
    expect(store.chatsByExternalId.get("tg:chat:1")?.syncEnabled).toBe(true);
    expect(store.chatsByExternalId.get("tg:chat:10")?.syncEnabled).toBe(false);
    store.newChatSync = "all";
    await module.ingest({ generation: FIRST, envelopes: [chatEnvelope(second, { title: "Must not replace stored metadata" }), liveMessage(10, 1)] });
    expect(store.chatsByExternalId.get("tg:chat:10")?.name).toBe("New DM");
    expect(store.chatsByExternalId.get("tg:chat:10")?.syncEnabled).toBe(false);
    expect(store.messagesByExternalId.has("tg:msg:10:1")).toBe(false);
    store.newChatSync = "invalid";
    await expect(module.ingest({ envelopes: [chatEnvelope({ ...second, id: 11 })] })).rejects.toThrow("setting is missing or invalid");
    expect(store.chatsByExternalId.has("tg:chat:11")).toBe(false);
  });

  it("migrates agreeing legacy choices, retains multi-account conflicts and resumes after an explicit choice", async () => {
    const legacy: SyncMigrationEntity[] = [
      { id: entityId("conflict"), schemaId: CHAT, name: "Large", indexed: true, isPinned: null, properties: { chat_id: 1, type: "supergroup", member_count: 5000 }, syncEnabled: null, syncRevision: null },
      { id: entityId("agrees"), schemaId: CHAT, name: "DM", indexed: false, isPinned: null, properties: { chat_id: 2, type: "private" }, syncEnabled: null, syncRevision: null },
    ];
    const graph = mockGraph({
      applyBatch: () => Promise.resolve({ ids: { self: entityId("self-id") }, created: 0, updated: 1, linksAdded: 0, droppedKeys: [], resolved: [] }),
      listSyncMigrationEntities: () => Promise.resolve({ items: legacy, next: null }),
      listLinked: (spec) => Promise.resolve(page([false, true].map((pinned, i) => linkedEntity(
        entity(entityId(`self-${String(i)}`), "Me", { schemaId: "telegram.account", source: { source: "telegram-ts", account: `account-${String(i)}`, externalId: `tg:account:${String(i)}` } }),
        { id: `edge-${String(i)}`, from: entityId(`self-${String(i)}`), to: entityId(spec.parentId), kind: "observed_in", metadata: { is_pinned: pinned } },
      )))),
      updateEntitySyncEnabled: (params) => {
        const row = legacy.find((item) => item.id === params.id);
        if (row === undefined) throw new Error("unknown migration target");
        row.syncEnabled = params.syncEnabled;
        row.syncRevision = "0";
        return Promise.resolve({ syncRevision: "0" });
      },
      syncState: syncStateDouble(),
    });
    const mounted = await mountModule(TelegramModule, { mode: "dispatch", graph, ctx: { extensionId: "telegram" } });
    const module = mountModule(TelegramModule, { graph }).module;
    const connection = { userId: "u1", sourceId: "telegram-ts", accountId: "account-0", identityKey: "9001" };
    await module.onConnectionReady(connection);
    expect(graph.spies.updateEntitySyncEnabled).toHaveBeenCalledExactlyOnceWith({ id: entityId("agrees"), syncEnabled: true });
    await module.onConnectionReady(connection);
    expect(graph.spies.updateEntitySyncEnabled).toHaveBeenCalledTimes(1);
    await expect(mounted.rpc("telegram.chat.syncMigration", {})).resolves.toMatchObject({ complete: false, issues: [{
      target: { schemaId: CHAT, key: entityId("conflict") }, legacyIds: [entityId("conflict")],
      accounts: [{ accountId: "account-0", syncEnabled: false }, { accountId: "account-1", syncEnabled: true }],
    }] });
    await expect(mounted.rpc("sync.selection", { sourceId: "telegram-ts", accountId: "account-0", accountGeneration: 1 })).rejects.toThrow("migration is incomplete");
    expect(mounted.tools.find((entry) => entry.name === "telegram.chat.resolveSyncMigration")?.requiresApproval).toBe(true);
    await expect(mounted.rpc("telegram.chat.resolveSyncMigration", { target: { schemaId: CHAT, key: entityId("conflict") }, syncEnabled: false })).resolves.toEqual({ complete: true, issues: [] });
    expect(legacy.map((item) => [item.id, item.syncEnabled, item.indexed])).toEqual([[entityId("conflict"), false, true], [entityId("agrees"), true, false]]);
  });

  it("selects saved chat choices for the exact observing account without deriving them from indexing or pinning", async () => {
    const rows: (PersistentEntity & Syncable)[] = [
      { ...entity(entityId("chat-a"), "A", { schemaId: CHAT, properties: { chat_id: 1, type: "supergroup", member_count: 100000 } }), syncEnabled: true, syncRevision: "2" },
      { ...entity(entityId("chat-b"), "B", { schemaId: CHAT, properties: { chat_id: 2, type: "private" } }), syncEnabled: false, syncRevision: "9" },
    ];
    const self = entity(entityId("self-id"), "Me", { schemaId: "telegram.account", source: { source: "telegram-ts", account: "account-1", externalId: SELF } });
    const other = { ...self, id: entityId("other-self"), source: { ...self.source, account: "account-2" } };
    const graph = mockGraph({
      listSyncMigrationEntities: () => Promise.resolve({ items: rows.map((row) => ({
        id: row.id, schemaId: CHAT, name: row.name, indexed: !row.syncEnabled, isPinned: null,
        properties: keysOf(row.properties), syncEnabled: row.syncEnabled, syncRevision: row.syncRevision,
      })), next: null }),
      listEntitiesByPropertyField: () => Promise.resolve(page([self, other])),
      listLinked: (spec) => {
        expect(spec).toMatchObject({ parentId: entityId("self-id"), linkKind: "observed_in", direction: "out" });
        return Promise.resolve(page(rows.map((row) => ({
          ...storedRead(row),
          link: link(self.id, row.id, "observed_in", { id: `edge:${row.id}`, metadata: { is_pinned: true } }),
        }))));
      },
    });
    const mounted = await mountModule(TelegramModule, { mode: "dispatch", graph, ctx: { extensionId: "telegram" } });
    const result = await mounted.rpc("sync.selection", { sourceId: "telegram-ts", accountId: "account-1", accountGeneration: 4 });
    expect(result).toEqual({ surface: "telegram", choices: [
      { id: entityId("chat-a"), scopeId: "1", syncEnabled: true, syncRevision: "2" },
      { id: entityId("chat-b"), scopeId: "2", syncEnabled: false, syncRevision: "9" },
    ] });
  });

  it("states counts relative to the edge, names the excluded, moves by one for a live message and answers departures", async () => {
    const store = new Store();
    const module = mountModule(TelegramModule, { graph: store.graph(), ctx: { extensionId: "telegram" } }).module;
    const chatPage = chats.map((chat) => chatEnvelope(chat));

    // Only admitted chats state work; disabled chats remain selectable without history or a pass stamp.
    await expect(module.ingest({ generation: FIRST, envelopes: chatPage })).resolves.toEqual({
      droppedRemoteIds: [], triggerChecks: [],
      plan: { [CHAT]: { total: 5, skipped: 0 }, [MESSAGE]: { total: 1200 + 300 + 7000 + 100, skipped: 0 } },
      excluded: [],
    });
    expect(store.edgesByChat.get(entityId("id:tg:chat:7"))?.metadata).toMatchObject({ is_pinned: true, sync_pass: FIRST, sync_total: 100, sync_skipped: 0 });
    expect(store.edgesByChat.get(entityId("id:tg:chat:3"))?.metadata).not.toHaveProperty("sync_pass");
    expect(store.edgesByChat.get(entityId("id:tg:chat:6"))?.metadata).toMatchObject({ sync_pass: FIRST });
    expect(store.edgesByChat.get(entityId("id:tg:chat:6"))?.metadata).not.toHaveProperty("sync_total");

    // The same page again in the same pass states nothing new.
    await expect(module.ingest({ generation: FIRST, envelopes: chatPage })).resolves.toEqual({
      droppedRemoteIds: [], triggerChecks: [], plan: zero, excluded: [],
    });

    // A restatement moves by the difference; a chat counted at last states in full.
    const first = chats[0]; const sixth = chats[5];
    if (first === undefined || sixth === undefined) throw new Error("fixture");
    await expect(module.ingest({ generation: FIRST, envelopes: [chatEnvelope(first, { message_count: 1205 }), chatEnvelope(sixth, { message_count: 40 })] })).resolves.toEqual({
      droppedRemoteIds: [], triggerChecks: [], plan: { [CHAT]: { total: 0, skipped: 0 }, [MESSAGE]: { total: 45, skipped: 0 } }, excluded: [],
    });

    // A live message on an admitted chat states one and moves the edge; on an excluded chat nothing.
    await expect(module.ingest({ generation: FIRST, envelopes: [liveMessage(1, 1206)] })).resolves.toMatchObject({
      plan: { [CHAT]: { total: 0, skipped: 0 }, [MESSAGE]: { total: 1, skipped: 0 } }, excluded: [],
    });
    expect(store.edgesByChat.get(entityId("id:tg:chat:1"))?.metadata).toMatchObject({ sync_pass: FIRST, sync_total: 1206 });
    // The Source uses the same live identity for edits and retries; neither grows the plan.
    const edited = liveMessage(1, 1206, "Edited message");
    for (const envelope of [edited, edited]) {
      await expect(module.ingest({ generation: FIRST, envelopes: [envelope] })).resolves.toMatchObject({ plan: zero });
      expect(store.edgesByChat.get(entityId("id:tg:chat:1"))?.metadata).toMatchObject({ sync_total: 1206 });
    }
    await expect(module.ingest({ generation: FIRST, envelopes: [liveMessage(3, 900000)] })).resolves.toMatchObject({ plan: zero, excluded: [] });

    // A page outside a worker states nothing and stamps nothing.
    const outside = await module.ingest({ envelopes: [chatEnvelope(first, { message_count: 1300 })] });
    expect(outside).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] });
    expect(store.edgesByChat.get(entityId("id:tg:chat:1"))?.metadata).toMatchObject({ sync_pass: FIRST, sync_total: 1206 });

    // A new pass states everything in full again; chat 6 is not on its page.
    const secondPage = chats.filter((chat) => chat.id !== 6).map((chat) => chatEnvelope(chat, chat.id === 1 ? { message_count: 1206 } : {}));
    await expect(module.ingest({ generation: SECOND, envelopes: secondPage })).resolves.toEqual({
      droppedRemoteIds: [], triggerChecks: [],
      plan: { [CHAT]: { total: 4, skipped: 0 }, [MESSAGE]: { total: 1206 + 300 + 7000 + 100, skipped: 0 } },
      excluded: [],
    });

    // Snapshot omission contains no provider departure time, so it cannot end
    // the missing chat's membership.
    expect(store.endedAt).toEqual([]);
    expect(store.windows).toEqual([]);

    // A chat re-reported after snapshot omission remains on its active edge.
    await expect(module.ingest({ generation: SECOND, envelopes: [chatEnvelope(sixth, { message_count: 40 })] })).resolves.toEqual({
      droppedRemoteIds: [], triggerChecks: [], plan: { [CHAT]: { total: 1, skipped: 0 }, [MESSAGE]: { total: 40, skipped: 0 } }, excluded: [],
    });
    expect(store.endedAt).toEqual([]);
    expect(store.edgesByChat.get(entityId("id:tg:chat:6"))?.validUntil).toBeNull();
  });
});
