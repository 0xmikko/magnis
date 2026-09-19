/**
 * @layer: module
 * @test-id: tst_module_telegram_plan_001
 * @scenario: scn_telegram_sync_plan_001
 * @covers: plugins/modules/telegram/module/service.ts::ingest (plan, excluded), onSyncComplete (departed, plan)
 * @deterministic: yes
 * @fixtures: seven chats with fixed counts, pins and indexing choices; an in-memory graph double
 *
 * The plan grows out of the pages: for every chat a page carries, the module
 * states that chat's count relative to the statement it keeps on the
 * operator's observed_in edge — in full on a new pass, zero for a re-read,
 * the difference for a restatement, one for a live message — names the chats
 * it leaves out of history, and at the end of the pass answers the chats it
 * did not see with the negative of what it stated for them.
 */
import { describe, expect, it } from "vitest";
import type { GraphBatchInput, LinkSummary, RawEntity, WindowSpec } from "@magnis/plugin-sdk";
import { entity, mockGraph, mountModule, windowRow } from "@magnis/testkit/module";
import { CHAT, MESSAGE } from "../../schema.ts";
import type { SyncEnvelope } from "../../types.ts";
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

function chatEnvelope(chat: ChatFixture, over: Record<string, unknown> = {}): SyncEnvelope {
  return {
    source_id: "telegram-ts", surface: "telegram", account_id: "account-1", user_id: "u1", identity_key: "9001",
    kind: "snapshot", remote_id: `tg:chat:${String(chat.id)}`, timestamp: "2026-09-02T00:00:00Z",
    payload: { entity_type: "chat", chat_id: chat.id, title: chat.title, ...chat.props, ...over },
  };
}

function liveMessage(chatId: number, messageId: number): SyncEnvelope {
  return {
    source_id: "telegram-ts", surface: "telegram", account_id: "account-1", user_id: "u1", identity_key: "9001",
    kind: "live", remote_id: `tg:msg:${String(chatId)}:${String(messageId)}`, timestamp: "2026-09-02T00:00:00Z",
    payload: { entity_type: "message", message_id: messageId, chat_id: chatId, sender_id: 501, sender_name: "Alice", text: "hi", date: "2026-09-02T00:00:00Z" },
  };
}

/** The Graph as the module leaves it: chats by anchor, the operator's edges by chat. */
class Store {
  readonly chatsByAnchor = new Map<string, RawEntity>();
  readonly edgesByChat = new Map<string, LinkSummary>();
  readonly statuses: [string, string][] = [];
  windows: string[] = [];

  chatOf(id: string): RawEntity | undefined {
    return [...this.chatsByAnchor.values()].find((chat) => chat.id === id);
  }

  graph(): ReturnType<typeof mockGraph> {
    return mockGraph({
      find_by_anchor: (anchor) => Promise.resolve(anchor === SELF ? "self-id" : this.chatsByAnchor.get(anchor)?.id ?? null),
      find_by_anchors: (anchors) => Promise.resolve(anchors.map((anchor) => this.chatsByAnchor.get(anchor)?.id ?? null)),
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
          if (item.schema_id === CHAT && item.anchor !== undefined) {
            const known = this.chatsByAnchor.get(item.anchor);
            this.chatsByAnchor.set(item.anchor, { ...entity(id, item.name ?? "", { schema_id: CHAT, anchor: item.anchor }), properties: { ...(known?.properties ?? {}), ...item.properties } });
          }
        }
        for (const link of fragment.links ?? []) {
          if (link.kind !== "observed_in") continue;
          const refAnchor = fragment.refs?.find((ref) => ref.key === link.to_key)?.anchor;
          const chatId = ids[link.to_key] ?? (refAnchor === undefined ? undefined : this.chatsByAnchor.get(refAnchor)?.id);
          if (chatId === undefined) throw new Error(`observed_in link to unknown chat ${link.to_key}`);
          const known = this.edgesByChat.get(chatId);
          this.edgesByChat.set(chatId, { id: `edge:${chatId}`, from_id: "self-id", to_id: chatId, kind: "observed_in", status: known?.status ?? "canonical", metadata: link.metadata ?? null });
        }
        return Promise.resolve({ ids, created: fragment.entities.length, updated: 0, links_added: fragment.links?.length ?? 0, dropped_keys: [] });
      },
      update_properties: () => Promise.resolve(),
      set_link_status: (id, status) => {
        this.statuses.push([id, status]);
        for (const edge of this.edgesByChat.values()) if (edge.id === id) edge.status = status;
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
  it("states counts relative to the edge, names the excluded, moves by one for a live message and answers departures", async () => {
    const store = new Store();
    const module = mountModule(TelegramModule, { graph: store.graph(), ctx: { extension_id: "telegram" } }).module;
    const page = chats.map((chat) => chatEnvelope(chat));

    // A new pass: every chat in full; the excluded ones' first fifty, the rest skipped.
    await expect(module.ingest({ generation: FIRST, envelopes: page })).resolves.toEqual({
      dropped_remote_ids: [], trigger_checks: [],
      plan: { [CHAT]: { total: 7, skipped: 0 }, [MESSAGE]: { total: 1200 + 300 + 50 + 7000 + 20 + 100, skipped: 886237 } },
      excluded: ["3", "5"],
    });
    expect(store.edgesByChat.get("id:tg:chat:7")?.metadata).toMatchObject({ is_pinned: true, sync_pass: FIRST, sync_total: 100, sync_skipped: 0 });
    expect(store.edgesByChat.get("id:tg:chat:3")?.metadata).toMatchObject({ sync_pass: FIRST, sync_total: 50, sync_skipped: 886237 });
    expect(store.edgesByChat.get("id:tg:chat:6")?.metadata).toMatchObject({ sync_pass: FIRST });
    expect(store.edgesByChat.get("id:tg:chat:6")?.metadata).not.toHaveProperty("sync_total");

    // The same page again in the same pass states nothing new.
    await expect(module.ingest({ generation: FIRST, envelopes: page })).resolves.toEqual({
      dropped_remote_ids: [], trigger_checks: [], plan: zero, excluded: ["3", "5"],
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
    await expect(module.ingest({ generation: FIRST, envelopes: [liveMessage(3, 900000)] })).resolves.toMatchObject({ plan: zero, excluded: ["3"] });

    // A page outside a worker states nothing and stamps nothing.
    const outside = await module.ingest({ envelopes: [chatEnvelope(first, { message_count: 1300 })] });
    expect(outside).toEqual({ dropped_remote_ids: [], trigger_checks: [] });
    expect(store.edgesByChat.get("id:tg:chat:1")?.metadata).toMatchObject({ sync_pass: FIRST, sync_total: 1206 });

    // A new pass states everything in full again; chat 6 is not on its page.
    const secondPage = chats.filter((chat) => chat.id !== 6).map((chat) => chatEnvelope(chat, chat.id === 1 ? { message_count: 1206 } : {}));
    await expect(module.ingest({ generation: SECOND, envelopes: secondPage })).resolves.toEqual({
      dropped_remote_ids: [], trigger_checks: [],
      plan: { [CHAT]: { total: 6, skipped: 0 }, [MESSAGE]: { total: 1206 + 300 + 50 + 7000 + 20 + 100, skipped: 886237 } },
      excluded: ["3", "5"],
    });

    // The end of the pass: the chat it did not see left, with the negative of its statement.
    await expect(module.onSyncComplete({ user_id: "u1", source_id: "telegram-ts", account_id: "account-1", identity_key: "9001", generation: SECOND })).resolves.toEqual({
      departed: ["6"], plan: { [CHAT]: { total: -1, skipped: 0 }, [MESSAGE]: { total: -40, skipped: 0 } },
    });
    expect(store.statuses).toEqual([["edge:id:tg:chat:6", "decayed"]]);
    expect(store.windows).toEqual(["distinct"]);
    // Asked again, nothing more has left.
    await expect(module.onSyncComplete({ user_id: "u1", source_id: "telegram-ts", account_id: "account-1", identity_key: "9001", generation: SECOND })).resolves.toEqual({ departed: [], plan: zero });

    // A chat re-reported after leaving is restored and stated in full.
    await expect(module.ingest({ generation: SECOND, envelopes: [chatEnvelope(sixth, { message_count: 40 })] })).resolves.toEqual({
      dropped_remote_ids: [], trigger_checks: [], plan: { [CHAT]: { total: 1, skipped: 0 }, [MESSAGE]: { total: 40, skipped: 0 } }, excluded: [],
    });
    expect(store.statuses).toEqual([["edge:id:tg:chat:6", "decayed"], ["edge:id:tg:chat:6", "canonical"]]);
  });
});
