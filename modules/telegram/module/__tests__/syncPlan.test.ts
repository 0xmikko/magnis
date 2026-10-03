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
import type { CanonicalEntity, CanonicalLink, GraphBatchInput, JsonObject, JsonValue, SyncEnvelope, WindowSpec } from "@magnis/sdk";
import { describe, expect, it } from "vitest";
import { entity, linkedEntity, mockGraph, mountModule, page } from "@magnis/testkit/module";
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

/** The Graph as the module leaves it: chats by external id, the operator's edges by chat. */
class Store {
  readonly chatsByExternalId = new Map<string, CanonicalEntity>();
  readonly edgesByChat = new Map<string, CanonicalLink>();
  readonly messagesByExternalId = new Map<string, string>();
  readonly endedAt: [string, string][] = [];
  windows: string[] = [];

  chatOf(id: string): CanonicalEntity | undefined {
    return [...this.chatsByExternalId.values()].find((chat) => chat.id === id);
  }

  graph(): ReturnType<typeof mockGraph> {
    return mockGraph({
      findByExternalId: (externalId) => Promise.resolve(externalId === SELF ? "self-id" : this.chatsByExternalId.get(externalId)?.id ?? null),
      findByExternalIds: (externalIds) => Promise.resolve(externalIds.map((externalId) => this.chatsByExternalId.get(externalId)?.id ?? this.messagesByExternalId.get(externalId) ?? null)),
      getEntities: (ids) => Promise.resolve(ids.flatMap((id) => { const chat = this.chatOf(id); return chat === undefined ? [] : [chat]; })),
      listLinked: (spec) => {
        expect(spec).toMatchObject({ linkKind: "observed_in", direction: "in" });
        const edge = this.edgesByChat.get(spec.parentId);
        const self = entity("self-id", "Me", { schemaId: "telegram.account", source: { source: "test", account: "a1", externalId: SELF } });
        return Promise.resolve(page(edge === undefined ? [] : [linkedEntity(self, edge)]));
      },
      applyBatch: (fragment: GraphBatchInput) => {
        const ids: Record<string, string> = {};
        for (const item of fragment.entities) {
          const id = item.key === "self" ? "self-id" : `id:${item.key}`;
          ids[item.key] = id;
          if (item.schemaId === MESSAGE && item.externalId !== null) this.messagesByExternalId.set(item.externalId, id);
          if (item.schemaId === CHAT && item.externalId !== null) {
            const known = this.chatsByExternalId.get(item.externalId);
            this.chatsByExternalId.set(item.externalId, entity(id, item.name ?? "", {
              schemaId: CHAT,
              source: { source: "test", account: "a1", externalId: item.externalId },
              properties: { ...keysOf(known?.properties), ...keysOf(item.properties ?? undefined) },
            }));
          }
        }
        for (const link of fragment.links) {
          if (link.kind !== "observed_in") continue;
          const refExternalId = fragment.refs.find((ref) => ref.key === link.toKey)?.externalId;
          const chatId = ids[link.toKey] ?? (refExternalId === undefined || refExternalId === null ? undefined : this.chatsByExternalId.get(refExternalId)?.id);
          if (chatId === undefined) throw new Error(`observed_in link to unknown chat ${link.toKey}`);
          const known = this.edgesByChat.get(chatId);
          this.edgesByChat.set(chatId, {
            id: `edge:${chatId}`, owner: "u1", from: "self-id", to: chatId, kind: "observed_in", createdAt: "2026-09-02T00:00:00Z",
            origin: "canonical", validFrom: known?.validFrom ?? null, validUntil: known?.validUntil ?? null, metadata: link.metadata,
          });
        }
        return Promise.resolve({ ids, created: fragment.entities.length, updated: 0, linksAdded: fragment.links.length, droppedKeys: [] });
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
        return Promise.resolve(page(rows.slice(spec.offset, spec.offset + spec.limit), rows.length));
      },
    });
  }
}

const zero = { [CHAT]: { total: 0, skipped: 0 }, [MESSAGE]: { total: 0, skipped: 0 } };

describe("tst_module_telegram_plan_001 — the module states its plan from the pages", () => {
  it("states counts relative to the edge, names the excluded, moves by one for a live message and answers departures", async () => {
    const store = new Store();
    const module = mountModule(TelegramModule, { graph: store.graph(), ctx: { extensionId: "telegram" } }).module;
    const chatPage = chats.map((chat) => chatEnvelope(chat));

    // A new pass: every chat in full; the excluded ones' first hundred, the rest skipped.
    await expect(module.ingest({ generation: FIRST, envelopes: chatPage })).resolves.toEqual({
      droppedRemoteIds: [], triggerChecks: [],
      plan: { [CHAT]: { total: 7, skipped: 0 }, [MESSAGE]: { total: 1200 + 300 + 100 + 7000 + 20 + 100, skipped: 886187 } },
      excluded: ["3", "5"],
    });
    expect(store.edgesByChat.get("id:tg:chat:7")?.metadata).toMatchObject({ is_pinned: true, sync_pass: FIRST, sync_total: 100, sync_skipped: 0 });
    expect(store.edgesByChat.get("id:tg:chat:3")?.metadata).toMatchObject({ sync_pass: FIRST, sync_total: 100, sync_skipped: 886187 });
    expect(store.edgesByChat.get("id:tg:chat:6")?.metadata).toMatchObject({ sync_pass: FIRST });
    expect(store.edgesByChat.get("id:tg:chat:6")?.metadata).not.toHaveProperty("sync_total");

    // The same page again in the same pass states nothing new.
    await expect(module.ingest({ generation: FIRST, envelopes: chatPage })).resolves.toEqual({
      droppedRemoteIds: [], triggerChecks: [], plan: zero, excluded: ["3", "5"],
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
    expect(store.edgesByChat.get("id:tg:chat:1")?.metadata).toMatchObject({ sync_pass: FIRST, sync_total: 1206 });
    // The Source uses the same live identity for edits and retries; neither grows the plan.
    const edited = liveMessage(1, 1206, "Edited message");
    for (const envelope of [edited, edited]) {
      await expect(module.ingest({ generation: FIRST, envelopes: [envelope] })).resolves.toMatchObject({ plan: zero });
      expect(store.edgesByChat.get("id:tg:chat:1")?.metadata).toMatchObject({ sync_total: 1206 });
    }
    await expect(module.ingest({ generation: FIRST, envelopes: [liveMessage(3, 900000)] })).resolves.toMatchObject({ plan: zero, excluded: ["3"] });

    // A page outside a worker states nothing and stamps nothing.
    const outside = await module.ingest({ envelopes: [chatEnvelope(first, { message_count: 1300 })] });
    expect(outside).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] });
    expect(store.edgesByChat.get("id:tg:chat:1")?.metadata).toMatchObject({ sync_pass: FIRST, sync_total: 1206 });

    // A new pass states everything in full again; chat 6 is not on its page.
    const secondPage = chats.filter((chat) => chat.id !== 6).map((chat) => chatEnvelope(chat, chat.id === 1 ? { message_count: 1206 } : {}));
    await expect(module.ingest({ generation: SECOND, envelopes: secondPage })).resolves.toEqual({
      droppedRemoteIds: [], triggerChecks: [],
      plan: { [CHAT]: { total: 6, skipped: 0 }, [MESSAGE]: { total: 1206 + 300 + 100 + 7000 + 20 + 100, skipped: 886187 } },
      excluded: ["3", "5"],
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
    expect(store.edgesByChat.get("id:tg:chat:6")?.validUntil).toBeNull();
  });
});
