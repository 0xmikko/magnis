/** The declaration is not a wish: all three records this module writes have to
 * pass it — an account, a chat and a message — through the module's REAL
 * ingest rather than copied dictionaries.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { describe, expect, it } from "vitest";
import { entity } from "@magnis/declare";
import { descriptorFrom } from "@magnis/declare/derive";
import type { GraphBatchInput, SourceEnvelope } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, sourceEnvelope } from "@magnis/testkit/module";

import { TelegramModule } from "./module/service.ts";
import { account, chat, message } from "./entities.ts";

const DECLARED = {
  "telegram.account": account,
  "telegram.chat": chat,
  "telegram.message": message,
} as const;

const base = (over: Partial<SourceEnvelope>): SourceEnvelope =>
  sourceEnvelope("telegram", {}, { source_id: "telegram-ts", user_id: "u1", identity_key: "9001", remote_id: "tg:msg:42:7", timestamp: "2026-08-12T08:00:01Z", ...over });

async function written(): Promise<GraphBatchInput["entities"]> {
  const batches: GraphBatchInput[] = [];
  const graph = mockGraph({
    moduleSettings: () => Promise.resolve({ newChatSync: "all" }),
    admitSyncEntities: (subjects) => Promise.resolve(subjects.flatMap(subject => [...subject.remoteIds])),
    find_by_anchor: () => Promise.resolve(null),
    find_by_anchors: (anchors) => Promise.resolve(anchors.map(() => null)),
    apply_batch: (fragment: GraphBatchInput) => {
      batches.push(fragment);
      return Promise.resolve({
        ids: Object.fromEntries(fragment.entities.map((e) => [e.key, `id:${e.key}`])),
        created: fragment.entities.length,
        updated: 0,
        links_added: fragment.links?.length ?? 0,
        dropped_keys: [],
      });
    },
    list_entities_window: () => Promise.resolve({ items: [], total: 0 }),
    get_entities: (ids) => Promise.resolve(ids.map(id => ({ id, name: "Magnis Builders", schema_id: "telegram.chat", indexed: true, syncEnabled: true, syncRevision: "0" }))),
    // The message carries a link and a photo: a link becomes a web entity of
    // its own, and downloadable media becomes a file entity.
    web_register: () => Promise.resolve("web-1"),
    web_register_batch: (links: readonly unknown[]) => Promise.resolve(links.map(() => "web-1")),
    file_register: () => Promise.resolve("file-1"),
    file_register_batch: (files: readonly unknown[]) => Promise.resolve(files.map(() => "file-1")),
  });
  const mod = mountModule(TelegramModule, { graph }).module;
  await mod.ingest({
    envelopes: [
      base({
        remote_id: "tg:chat:42",
        payload: {
          entity_type: "chat", chat_id: 42, title: "Magnis Builders", type: "group",
          username: "builders", member_count: 12, message_count: 5001, avatar_url: "https://example.test/avatar", pts: 9, unread_count: 3, is_pinned: true, is_indexed: true,
          read_inbox_max_id: 6, read_outbox_max_id: 5, unread_mentions_count: 0, top_message: 7,
        },
      }),
      base({
        payload: {
          entity_type: "message", message_id: 7, chat_id: 42, sender_id: 501,
          sender_name: "Alice", text: "Read https://example.test/demo",
          date: "2026-08-12T08:00:00Z", media_type: "photo", has_media: true,
          file_name: "photo_42_7.jpg",
          source_ref: {
            account_id: "account-1", chat_id: 42, message_id: 7,
            media_type: "photo", dest_subpath: "telegram/photos/tg_42_7.jpg",
          },
          sender_info: { first_name: "Alice", username: "alice" },
        },
      }),
    ],
  });
  return batches.flatMap((b) => b.entities);
}

describe("telegram declares what it writes", () => {
  it.each([true, false])("carries explicit syncable=%s without changing the properties schema", (syncable) => {
    const identity = { id: "telegram.chat", name: "Chat" };
    const ordinary = descriptorFrom(entity(identity, chat.shape, { order: ["chat_id", "asc"] })).descriptor;
    const declared = descriptorFrom(entity({ ...identity, syncable }, chat.shape, { order: ["chat_id", "asc"] })).descriptor;
    expect(declared).toHaveProperty("syncable", syncable);
    expect(declared.json_schema).toEqual(ordinary.json_schema);
    expect(ordinary).not.toHaveProperty("syncable");
  });

  it("declares synchronization on the chat descriptor, outside provider properties", () => {
    const { descriptor } = descriptorFrom(chat);
    expect(descriptor).toHaveProperty("syncable", true);
    expect(descriptor.json_schema).not.toHaveProperty("properties.syncEnabled");
    expect(descriptor.json_schema).not.toHaveProperty("properties.syncable");
    expect(descriptorFrom(account).descriptor).not.toHaveProperty("syncable");
    expect(descriptorFrom(message).descriptor).not.toHaveProperty("syncable");
  });

  it("every record the module writes today passes its own declaration", async () => {
    const entities = await written();
    // An account, a chat and a message — a run that wrote fewer proves less.
    expect(new Set(entities.map((e) => e.schema_id)).size).toBeGreaterThan(2);
    for (const e of entities) {
      const declared = DECLARED[e.schema_id as keyof typeof DECLARED];
      expect(declared, `${e.schema_id} is written but not declared`).toBeDefined();
      expect(declared.safeParse(e.properties ?? {}).error?.issues ?? []).toEqual([]);
    }
  });

  /**
   * @test-id: tst_module_telegram_entities_003
   * @scenario: scn_telegram_chat_index_flag_001
   * @covers: modules/telegram/entities.ts::chat
   * @deterministic: yes
   * @fixtures: inline chat dictionaries with and without the operator's index flag
   */
  it("tst_module_telegram_entities_003 the chat declaration carries the index flag the module reads and sets", () => {
    expect(chat.safeParse({ chat_id: 42, title: "Magnis Builders", is_indexed: true }).error?.issues ?? []).toEqual([]);
    expect(chat.safeParse({ chat_id: 42, is_indexed: false }).success).toBe(true);
    expect(chat.safeParse({ chat_id: 42, is_indexed: "yes" }).success).toBe(false);
    expect(chat.safeParse({ chat_id: 42, indexed: true }).success).toBe(false);
  });

  it("what one account observes is not what the chat is", () => {
    // unread_count and is_pinned ride the observer's own edge.
    expect(chat.safeParse({ title: "Magnis Builders", unread_count: 3 }).success).toBe(false);
    expect(JSON.stringify(chat.safeParse({ is_pinned: true }).error?.issues)).toContain("is_pinned");
  });

  it("the chat and the sender are edges, so writing them back is refused", () => {
    expect(message.safeParse({ text: "hi", chat_id: 42 }).success).toBe(false);
    expect(message.safeParse({ text: "hi", sender_id: 501 }).success).toBe(false);
  });
});
