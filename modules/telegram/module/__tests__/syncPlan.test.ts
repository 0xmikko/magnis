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
import { describe, expect, it } from "vitest";
import type { GraphBatchInput, LinkSummary, RawEntity, RawSyncableEntity, SourceEnvelope, SyncMigrationEntity, WindowSpec } from "@magnis/plugin-sdk";
import { entity, mockGraph, mountModule, sourceEnvelope, windowRow } from "@magnis/testkit/module";
import { CHAT, MESSAGE } from "../../schema.ts";
import { TelegramModule } from "../service.ts";

const SELF = "tg:account:9001";
const FIRST = "initial:row:1";
const SECOND = "initial:row:2";

interface ChatFixture { readonly id: number; readonly title: string; readonly props: Record<string, unknown> }
const chats: readonly ChatFixture[] = [
  { id: 1, title: "Private", props: { type: "private", message_count: 1200 } },
  { id: 2, title: "Small group", props: { type: "group", member_count: 40, message_count: 300 } },
  { id: 3, title: "Large channel", props: { type: "supergroup", member_count: 5000, message_count: 886287 } },
  { id: 4, title: "Large but forced on", props: { type: "supergroup", member_count: 900, message_count: 7000, is_indexed: true } },
  { id: 5, title: "Private but forced off", props: { type: "private", message_count: 20, is_indexed: false } },
  { id: 6, title: "Never counted", props: { type: "group", member_count: 10 } },
  { id: 7, title: "Pinned large channel", props: { type: "supergroup", member_count: 3000, message_count: 100, is_pinned: true } },
];

function chatEnvelope(chat: ChatFixture, over: Record<string, unknown> = {}): SourceEnvelope {
  return sourceEnvelope(
    "telegram",
    { entity_type: "chat", chat_id: chat.id, title: chat.title, ...chat.props, ...over },
    { source_id: "telegram-ts", user_id: "u1", identity_key: "9001", remote_id: `tg:chat:${String(chat.id)}`, timestamp: "2026-09-02T00:00:00Z" },
  );
}

function liveMessage(chatId: number, messageId: number): SourceEnvelope {
  return sourceEnvelope(
    "telegram",
    { entity_type: "message", message_id: messageId, chat_id: chatId, sender_id: 501, sender_name: "Alice", text: "hi", date: "2026-09-02T00:00:00Z" },
    { source_id: "telegram-ts", user_id: "u1", identity_key: "9001", kind: "live", remote_id: `tg:msg:${String(chatId)}:${String(messageId)}`, timestamp: "2026-09-02T00:00:00Z" },
  );
}

/** The Graph as the module leaves it: chats by anchor, the operator's edges by chat. */
class Store {
  readonly chatsByAnchor = new Map<string, RawSyncableEntity>();
  newChatSync = "current";
  readonly edgesByChat = new Map<string, LinkSummary>();
  readonly messagesByAnchor = new Map<string, string>();
  readonly endedAt: [string, string][] = [];
  windows: string[] = [];

  chatOf(id: string): RawEntity | undefined {
    return [...this.chatsByAnchor.values()].find((chat) => chat.id === id);
  }

  graph(): ReturnType<typeof mockGraph> {
    return mockGraph({
      moduleSettings: () => Promise.resolve({ newChatSync: this.newChatSync }),
      admitSyncEntities: (subjects) => Promise.resolve(subjects.flatMap((subject) => [...this.chatsByAnchor.values()].find((chat) => chat.id === subject.entityId)?.syncEnabled === true ? [...subject.remoteIds] : [])),
      find_by_anchor: (anchor) => Promise.resolve(anchor === SELF ? "self-id" : this.chatsByAnchor.get(anchor)?.id ?? null),
      find_by_anchors: (anchors) => Promise.resolve(anchors.map((anchor) => this.chatsByAnchor.get(anchor)?.id ?? this.messagesByAnchor.get(anchor) ?? null)),
      get_entities: (ids) => Promise.resolve(ids.flatMap((id) => { const chat = this.chatOf(id); return chat === undefined ? [] : [chat]; })),
      list_linked: (spec) => {
        expect(spec).toMatchObject({ link_kind: "observed_in", direction: "in" });
        const edge = this.edgesByChat.get(spec.parent_id);
        const self = entity("self-id", "Me", { schema_id: "telegram.account", anchor: SELF });
        return Promise.resolve(edge === undefined ? { items: [], total: 0 } : { items: [{ entity: self, link: edge }], total: 1 });
      },
      apply_batch: (fragment: GraphBatchInput) => {
        const ids: Record<string, string> = {};
        for (const item of fragment.entities) {
          const id = item.key === "self" ? "self-id" : `id:${item.key}`;
          ids[item.key] = id;
          if (item.schema_id === MESSAGE && item.anchor !== undefined) this.messagesByAnchor.set(item.anchor, id);
          if (item.schema_id === CHAT && item.anchor !== undefined) {
            const known = this.chatsByAnchor.get(item.anchor);
            const syncEnabled = known === undefined ? item.syncEnabled : known.syncEnabled;
            if (syncEnabled === undefined) throw new Error("new chat requires a synchronization choice");
            this.chatsByAnchor.set(item.anchor, { ...entity(id, item.name ?? "", { schema_id: CHAT, anchor: item.anchor }), syncEnabled, syncRevision: known?.syncRevision ?? "0", properties: { ...(known?.properties ?? {}), ...item.properties } });
          }
        }
        for (const link of fragment.links ?? []) {
          if (link.kind !== "observed_in") continue;
          const refAnchor = fragment.refs?.find((ref) => ref.key === link.to_key)?.anchor;
          const chatId = ids[link.to_key] ?? (refAnchor === undefined ? undefined : this.chatsByAnchor.get(refAnchor)?.id);
          if (chatId === undefined) throw new Error(`observed_in link to unknown chat ${link.to_key}`);
          const known = this.edgesByChat.get(chatId);
          this.edgesByChat.set(chatId, { id: `edge:${chatId}`, from_id: "self-id", to_id: chatId, kind: "observed_in", validFrom: known?.validFrom ?? null, validUntil: known?.validUntil ?? null, metadata: link.metadata ?? null });
        }
        return Promise.resolve({ ids, created: fragment.entities.length, updated: 0, links_added: fragment.links?.length ?? 0, dropped_keys: [] });
      },
      update_properties: () => Promise.resolve(),
      update_properties_batch: () => Promise.resolve(),
      end_link: (id, validUntil) => {
        this.endedAt.push([id, validUntil]);
        for (const edge of this.edgesByChat.values()) if (edge.id === id) edge.validUntil = validUntil;
        return Promise.resolve();
      },
      list_entities_window: (spec: WindowSpec) => {
        expect(spec.limit).toBeLessThanOrEqual(500);
        expect(spec.filter_field).toEqual({ edge_kind: "observed_in", observer_anchor: SELF, edge_path: "sync_pass" });
        this.windows.push(spec.filter_op ?? "eq");
        // "distinct" is IS DISTINCT FROM: an unstamped edge, or no edge at all, is kept.
        const rows = [...this.chatsByAnchor.values()].filter((chat) => {
          const pass = this.edgesByChat.get(chat.id)?.metadata?.["sync_pass"];
          return spec.filter_op === "distinct" ? pass !== spec.filter_eq : pass === spec.filter_eq;
        }).map(windowRow);
        return Promise.resolve({ items: rows.slice(spec.offset, spec.offset + spec.limit), total: rows.length });
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
    expect(store.chatsByAnchor.get("tg:chat:1")?.syncEnabled).toBe(true);
    expect(store.chatsByAnchor.get("tg:chat:10")?.syncEnabled).toBe(false);
    store.newChatSync = "all";
    await module.ingest({ generation: FIRST, envelopes: [chatEnvelope(second, { title: "Must not replace stored metadata" }), liveMessage(10, 1)] });
    expect(store.chatsByAnchor.get("tg:chat:10")?.name).toBe("New DM");
    expect(store.chatsByAnchor.get("tg:chat:10")?.syncEnabled).toBe(false);
    expect(store.messagesByAnchor.has("tg:msg:10:1")).toBe(false);
    store.newChatSync = "invalid";
    await expect(module.ingest({ envelopes: [chatEnvelope({ ...second, id: 11 })] })).rejects.toThrow("setting is missing or invalid");
    expect(store.chatsByAnchor.has("tg:chat:11")).toBe(false);
  });

  it("migrates agreeing legacy choices, retains multi-account conflicts and resumes after an explicit choice", async () => {
    const legacy: SyncMigrationEntity[] = [
      { id: "conflict", schemaId: CHAT, name: "Large", indexed: true, isPinned: null, properties: { chat_id: 1, type: "supergroup", member_count: 5000 }, syncEnabled: null, syncRevision: null },
      { id: "agrees", schemaId: CHAT, name: "DM", indexed: false, isPinned: null, properties: { chat_id: 2, type: "private" }, syncEnabled: null, syncRevision: null },
    ];
    const graph = mockGraph({
      apply_batch: () => Promise.resolve({ ids: { self: "self-id" }, created: 0, updated: 1, links_added: 0, dropped_keys: [] }),
      listSyncMigrationEntities: () => Promise.resolve({ items: legacy, next: null }),
      list_linked: (spec) => Promise.resolve({ items: [false, true].map((pinned, i) => ({
        entity: { ...entity(`self-${String(i)}`, "Me", { schema_id: "telegram.account" }), source: { source: "telegram-ts", account: `account-${String(i)}`, externalId: `tg:account:${String(i)}` } },
        link: { id: `edge-${String(i)}`, from_id: `self-${String(i)}`, to_id: spec.parent_id, kind: "observed_in", validFrom: null, validUntil: null, metadata: { is_pinned: pinned } },
      })), total: 2 }),
      updateEntitySyncEnabled: (params) => {
        const row = legacy.find((item) => item.id === params.id);
        if (row === undefined) throw new Error("unknown migration target");
        row.syncEnabled = params.syncEnabled;
        row.syncRevision = "0";
        return Promise.resolve({ syncRevision: "0" });
      },
      syncState: () => Promise.resolve({ pending: true }),
    });
    const mounted = await mountModule(TelegramModule, { mode: "dispatch", graph, ctx: { extension_id: "telegram" } });
    const module = mountModule(TelegramModule, { graph }).module;
    const connection = { user_id: "u1", source_id: "telegram-ts", account_id: "account-0", identity_key: "9001" };
    await module.onConnectionReady(connection);
    expect(graph.spies.updateEntitySyncEnabled).toHaveBeenCalledExactlyOnceWith({ id: "agrees", syncEnabled: true });
    await module.onConnectionReady(connection);
    expect(graph.spies.updateEntitySyncEnabled).toHaveBeenCalledTimes(1);
    await expect(mounted.rpc("telegram.chat.syncMigration", {})).resolves.toMatchObject({ complete: false, issues: [{
      target: { schemaId: CHAT, key: "conflict" }, legacyIds: ["conflict"],
      accounts: [{ accountId: "account-0", syncEnabled: false }, { accountId: "account-1", syncEnabled: true }],
    }] });
    await expect(mounted.rpc("sync.selection", { sourceId: "telegram-ts", accountId: "account-0", accountGeneration: 1 })).rejects.toThrow("migration is incomplete");
    expect(mounted.tools.find((entry) => entry.name === "telegram.chat.resolveSyncMigration")?.requires_approval).toBe(true);
    await expect(mounted.rpc("telegram.chat.resolveSyncMigration", { target: { schemaId: CHAT, key: "conflict" }, syncEnabled: false })).resolves.toEqual({ complete: true, issues: [] });
    expect(legacy.map((item) => [item.id, item.syncEnabled, item.indexed])).toEqual([["conflict", false, true], ["agrees", true, false]]);
  });

  it("selects saved chat choices for the exact observing account without deriving them from indexing or pinning", async () => {
    const rows: RawSyncableEntity[] = [
      { ...entity("chat-a", "A", { schema_id: CHAT, indexed: false, properties: { chat_id: 1, type: "supergroup", member_count: 100000 } }), syncEnabled: true, syncRevision: "2" },
      { ...entity("chat-b", "B", { schema_id: CHAT, indexed: true, properties: { chat_id: 2, type: "private" } }), syncEnabled: false, syncRevision: "9" },
    ];
    const self = { ...entity("self-id", "Me", { schema_id: "telegram.account", anchor: SELF }), source: { source: "telegram-ts", account: "account-1", externalId: SELF } };
    const other = { ...self, id: "other-self", source: { ...self.source, account: "account-2" } };
    const graph = mockGraph({
      listSyncMigrationEntities: () => Promise.resolve({ items: rows.map((row) => ({
        id: row.id, schemaId: CHAT, name: row.name, indexed: row.indexed, isPinned: null,
        properties: row.properties ?? {}, syncEnabled: row.syncEnabled, syncRevision: row.syncRevision,
      })), next: null }),
      list_entities_by_property_field: () => Promise.resolve({ items: [self, other], total: 2 }),
      list_linked: (spec) => {
        expect(spec).toMatchObject({ parent_id: "self-id", link_kind: "observed_in", direction: "out" });
        return Promise.resolve({ items: rows.map((row) => ({ entity: row, link: {
          id: `edge:${row.id}`, from_id: self.id, to_id: row.id, kind: "observed_in", validFrom: null, validUntil: null,
          metadata: { is_pinned: true },
        } })), total: 2 });
      },
    });
    const mounted = await mountModule(TelegramModule, { mode: "dispatch", graph, ctx: { extension_id: "telegram" } });
    const result = await mounted.rpc("sync.selection", { sourceId: "telegram-ts", accountId: "account-1", accountGeneration: 4 });
    expect(result).toEqual({ surface: "telegram", choices: [
      { id: "chat-a", scopeId: "1", syncEnabled: true, syncRevision: "2" },
      { id: "chat-b", scopeId: "2", syncEnabled: false, syncRevision: "9" },
    ] });
  });

  it("states counts relative to the edge, names the excluded, moves by one for a live message and answers departures", async () => {
    const store = new Store();
    const module = mountModule(TelegramModule, { graph: store.graph(), ctx: { extension_id: "telegram" } }).module;
    const page = chats.map((chat) => chatEnvelope(chat));

    // Only admitted chats state work; disabled chats remain selectable without history or a pass stamp.
    await expect(module.ingest({ generation: FIRST, envelopes: page })).resolves.toEqual({
      dropped_remote_ids: [], trigger_checks: [],
      plan: { [CHAT]: { total: 5, skipped: 0 }, [MESSAGE]: { total: 1200 + 300 + 7000 + 100, skipped: 0 } },
      excluded: [],
    });
    expect(store.edgesByChat.get("id:tg:chat:7")?.metadata).toMatchObject({ is_pinned: true, sync_pass: FIRST, sync_total: 100, sync_skipped: 0 });
    expect(store.edgesByChat.get("id:tg:chat:3")?.metadata).not.toHaveProperty("sync_pass");
    expect(store.edgesByChat.get("id:tg:chat:6")?.metadata).toMatchObject({ sync_pass: FIRST });
    expect(store.edgesByChat.get("id:tg:chat:6")?.metadata).not.toHaveProperty("sync_total");

    // The same page again in the same pass states nothing new.
    await expect(module.ingest({ generation: FIRST, envelopes: page })).resolves.toEqual({
      dropped_remote_ids: [], trigger_checks: [], plan: zero, excluded: [],
    });

    // A restatement moves by the difference; a chat counted at last states in full.
    const first = chats[0]; const sixth = chats[5];
    if (first === undefined || sixth === undefined) throw new Error("fixture");
    await expect(module.ingest({ generation: FIRST, envelopes: [chatEnvelope(first, { message_count: 1205 }), chatEnvelope(sixth, { message_count: 40 })] })).resolves.toEqual({
      dropped_remote_ids: [], trigger_checks: [], plan: { [CHAT]: { total: 0, skipped: 0 }, [MESSAGE]: { total: 45, skipped: 0 } }, excluded: [],
    });

    // A live message on an admitted chat states one and moves the edge; on an excluded chat nothing.
    await expect(module.ingest({ generation: FIRST, envelopes: [liveMessage(1, 1206)] })).resolves.toMatchObject({
      plan: { [CHAT]: { total: 0, skipped: 0 }, [MESSAGE]: { total: 1, skipped: 0 } }, excluded: [],
    });
    expect(store.edgesByChat.get("id:tg:chat:1")?.metadata).toMatchObject({ sync_pass: FIRST, sync_total: 1206 });
    // The Source uses the same live identity for edits and retries; neither grows the plan.
    const edited = liveMessage(1, 1206);
    edited.payload.text = "Edited message";
    for (const envelope of [edited, edited]) {
      await expect(module.ingest({ generation: FIRST, envelopes: [envelope] })).resolves.toMatchObject({ plan: zero });
      expect(store.edgesByChat.get("id:tg:chat:1")?.metadata).toMatchObject({ sync_total: 1206 });
    }
    await expect(module.ingest({ generation: FIRST, envelopes: [liveMessage(3, 900000)] })).resolves.toMatchObject({ plan: zero, excluded: [] });

    // A page outside a worker states nothing and stamps nothing.
    const outside = await module.ingest({ envelopes: [chatEnvelope(first, { message_count: 1300 })] });
    expect(outside).toEqual({ dropped_remote_ids: [], trigger_checks: [] });
    expect(store.edgesByChat.get("id:tg:chat:1")?.metadata).toMatchObject({ sync_pass: FIRST, sync_total: 1206 });

    // A new pass states everything in full again; chat 6 is not on its page.
    const secondPage = chats.filter((chat) => chat.id !== 6).map((chat) => chatEnvelope(chat, chat.id === 1 ? { message_count: 1206 } : {}));
    await expect(module.ingest({ generation: SECOND, envelopes: secondPage })).resolves.toEqual({
      dropped_remote_ids: [], trigger_checks: [],
      plan: { [CHAT]: { total: 4, skipped: 0 }, [MESSAGE]: { total: 1206 + 300 + 7000 + 100, skipped: 0 } },
      excluded: [],
    });

    // Snapshot omission contains no provider departure time, so it cannot end
    // the missing chat's membership.
    expect(store.endedAt).toEqual([]);
    expect(store.windows).toEqual([]);

    // A chat re-reported after snapshot omission remains on its active edge.
    await expect(module.ingest({ generation: SECOND, envelopes: [chatEnvelope(sixth, { message_count: 40 })] })).resolves.toEqual({
      dropped_remote_ids: [], trigger_checks: [], plan: { [CHAT]: { total: 1, skipped: 0 }, [MESSAGE]: { total: 40, skipped: 0 } }, excluded: [],
    });
    expect(store.endedAt).toEqual([]);
    expect(store.edgesByChat.get("id:tg:chat:6")?.validUntil).toBeNull();
  });
});
