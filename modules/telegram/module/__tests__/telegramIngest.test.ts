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
import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule } from "@magnis/testkit/module";
import type { GraphBatchInput } from "@magnis/plugin-sdk";
import { CHAT, MESSAGE, TELEGRAM_ACCOUNT } from "../../schema.ts";
import type { SyncEnvelope } from "../../types.ts";
import { TelegramModule } from "../service.ts";

function messageEnvelope(kind: "snapshot" | "live" = "snapshot"): SyncEnvelope {
  return {
    source_id: "telegram-ts",
    surface: "telegram",
    account_id: "account-1",
    user_id: "u1",
    identity_key: "9001",
    kind,
    remote_id: "tg:msg:42:7",
    payload: {
      entity_type: "message",
      message_id: 7,
      chat_id: 42,
      sender_id: 501,
      sender_name: "Alice",
      text: "Read https://example.test/demo",
      date: "2026-08-12T08:00:00Z",
    },
    timestamp: "2026-08-12T08:00:01Z",
  };
}

describe("tst_module_telegram_ingest_002 — Telegram envelope mapping", () => {
  it.each(["2026-08-11T08:00:00Z", "2026-08-13T08:00:00Z"])("counts a new live message once across edits and replay, preserving newer previews (%s)", async (lastMessageDate) => {
    let count = 196;
    const anchors = new Set<string>();
    const graph = mockGraph({
      find_by_anchors: (requested) => Promise.resolve(requested.map((anchor) => anchor === "tg:chat:42" ? "chat-entity" : anchors.has(anchor) ? `id:${anchor}` : null)),
      get_entities: () => Promise.resolve([entity("chat-entity", "Chat", {
        schema_id: CHAT, properties: { chat_id: 42, type: "private", message_count: count, last_message_date: lastMessageDate },
      })]),
      apply_batch: (fragment) => {
        for (const item of fragment.entities) if (item.anchor) anchors.add(item.anchor);
        return Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, `id:${item.key}`])),
          created: fragment.entities.length, updated: 0, links_added: 0, dropped_keys: [],
        });
      },
      web_register_batch: (links) => Promise.resolve(links.map(() => "web-id")),
      update_properties_batch: (updates) => {
        for (const { properties } of updates) if (typeof properties.message_count === "number") count = properties.message_count;
        return Promise.resolve(undefined);
      },
    });
    const module = mountModule(TelegramModule, { graph }).module;
    const live = messageEnvelope("live");
    await module.ingest({ envelopes: [live] });
    expect(count).toBe(197);
    const edited = { ...live, payload: { ...live.payload, text: "Edited message" } };
    await module.ingest({ envelopes: [edited] });
    expect(count).toBe(197);
    await module.ingest({ envelopes: [edited] });
    expect(count).toBe(197);
    expect(graph.spies.update_properties_batch).toHaveBeenCalledWith([{
      entity_id: "chat-entity", properties: lastMessageDate > "2026-08-12T08:00:00Z" ? { message_count: 197 } : {
        message_count: 197, last_message_date: "2026-08-12T08:00:00Z",
        last_message_preview: "Read https://example.test/demo", last_sender_name: "Alice",
      },
    }]);
  });

  it("mints the provider-verified self account on connection ready", async () => {
    const graph = mockGraph({
      apply_batch: () =>
        Promise.resolve({ ids: { self: "self-id" }, created: 1, updated: 0, links_added: 0, dropped_keys: [] }),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await expect(
      module.onConnectionReady({ user_id: "u1", source_id: "telegram-ts", account_id: "a1", identity_key: "9001" }),
    ).resolves.toEqual({ ok: true });
    expect(graph.spies.apply_batch).toHaveBeenCalledWith({
      entities: [{
        key: "self",
        schema_id: TELEGRAM_ACCOUNT,
        name: "",
        anchor: "tg:account:9001",
        properties: { telegram_user_id: 9001, is_self: true },
      }],
      refs: [],
      links: [],
    });
  });

  it("refuses unstamped identity-scoped envelopes before graph access", async () => {
    const envelope = messageEnvelope();
    delete envelope.identity_key;
    const module = mountModule(TelegramModule, { graph: mockGraph() }).module;

    await expect(module.ingest({ envelopes: [envelope] })).rejects.toThrow(
      "envelope carries no identity_key",
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
      find_by_anchors: (anchors) => Promise.resolve(anchors.map(() => null)),
      apply_batch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, `id:${item.key}`])),
          created: fragment.entities.length,
          updated: 0,
          links_added: fragment.links?.length ?? 0,
          dropped_keys: [],
        }),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    const chat: SyncEnvelope = {
      ...messageEnvelope(),
      remote_id: "tg:chat:42",
      payload: { entity_type: "chat", chat_id: 42, title: "Magnis Builders" },
    };

    await expect(module.ingest({ envelopes: [chat] })).resolves.toEqual({
      dropped_remote_ids: [],
      trigger_checks: [],
    });
    expect(graph.spies.apply_batch).toHaveBeenCalledWith({
      entities: expect.arrayContaining([
        expect.objectContaining({
          key: "self",
          schema_id: TELEGRAM_ACCOUNT,
          anchor: "tg:account:9001",
        }),
        expect.objectContaining({
          key: "tg:chat:42",
          schema_id: CHAT,
          anchor: "tg:chat:42",
        }),
      ]),
      refs: [],
      links: [{
        from_key: "self",
        to_key: "tg:chat:42",
        kind: "observed_in",
        declared_by: "tg:chat:42",
        metadata: {},
      }],
    });
  });

  it("maps message/account nodes and structural links in one batch", async () => {
    const graph = mockGraph({
      find_by_anchors: (anchors) => Promise.resolve(anchors.map(() => "chat-entity")),
      get_entities: (ids) =>
        Promise.resolve(ids.map((id) => entity(id, "Chat", { schema_id: CHAT, properties: { chat_id: 42, type: "private" } }))),
      apply_batch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, `id:${item.key}`])),
          created: fragment.entities.length,
          updated: 0,
          links_added: fragment.links?.length ?? 0,
          dropped_keys: [],
        }),
      web_register: () => Promise.resolve("web-id"),
      web_register_batch: (links: readonly unknown[]) => Promise.resolve(links.map(() => "web-id")),
      update_properties: () => Promise.resolve(undefined),
      update_properties_batch: () => Promise.resolve(undefined),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    const result = await module.ingest({ envelopes: [messageEnvelope()] });

    expect(result).toEqual({ dropped_remote_ids: [], trigger_checks: [] });
    const applyBatch = graph.spies.apply_batch;
    if (applyBatch === undefined) throw new Error("telegram ingest: apply_batch spy missing");
    const fragment = applyBatch.mock.calls[0]?.[0] as {
      entities: { key: string; schema_id: string; idx?: string; date?: string; properties?: Record<string, unknown> }[];
      refs: { key: string; anchor: string }[];
      links: { from_key: string; to_key: string; kind: string }[];
    };
    expect(fragment.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "tg:msg:42:7",
        schema_id: MESSAGE,
        idx: "42",
        date: "2026-08-12T08:00:00Z",
        properties: expect.not.objectContaining({ chat_id: expect.anything(), sender_id: expect.anything() }),
      }),
      expect.objectContaining({ key: "acct:501", schema_id: TELEGRAM_ACCOUNT, anchor: "tg:account:501" }),
    ]));
    expect(fragment.refs).toContainEqual({ key: "chat:42", anchor: "tg:chat:42" });
    expect(fragment.links.map((link) => `${link.from_key}:${link.kind}:${link.to_key}`)).toEqual([
      "tg:msg:42:7:in_chat:chat:42",
      "tg:msg:42:7:authored_by:acct:501",
      "acct:501:observed_participant:chat:42",
    ]);
    expect(graph.spies.web_register_batch).toHaveBeenCalledWith([expect.objectContaining({
      url: "https://example.test/demo",
      parent_entity_id: "id:tg:msg:42:7",
      link_kind: "references",
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
      find_by_anchors: (anchors) => Promise.resolve(anchors.map(() => null)),
      apply_batch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, `id:${item.key}`])),
          created: fragment.entities.length,
          updated: 0,
          links_added: fragment.links?.length ?? 0,
          dropped_keys: [],
        }),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    const variants = [
      { text: `${"x".repeat(79)}😀 suffix`, name: `${"x".repeat(79)}😀` },
      { text: "😀".repeat(81), name: "😀".repeat(80) },
      { text: "x".repeat(81), name: "x".repeat(80) },
    ];
    const envelopes = variants.map(({ text }, index) => {
      const envelope = messageEnvelope();
      const messageId = index + 7;
      return {
        ...envelope,
        remote_id: `tg:msg:42:${String(messageId)}`,
        payload: { ...envelope.payload, message_id: messageId, text },
      };
    });

    await expect(module.ingest({ envelopes })).resolves.toEqual({ dropped_remote_ids: [], trigger_checks: [] });

    const applyBatch = graph.spies.apply_batch;
    if (applyBatch === undefined) throw new Error("telegram ingest: apply_batch spy missing");
    expect(applyBatch).toHaveBeenCalledTimes(1);
    const fragment = applyBatch.mock.calls[0]?.[0] as GraphBatchInput | undefined;
    expect(fragment?.entities.filter(({ schema_id }) => schema_id === MESSAGE).map(({ name, properties }) => ({
      name,
      text: properties?.text,
    }))).toEqual(variants);
    expect(envelopes.map(({ payload }) => payload.text)).toEqual(variants.map(({ text }) => text));
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
      find_by_anchors: (anchors) => Promise.resolve(anchors.map(() => "chat-entity")),
      get_entities: (ids) =>
        Promise.resolve(ids.map((id) => entity(id, "Chat", {
          schema_id: CHAT,
          properties: { chat_id: 42, type: "private" },
        }))),
      apply_batch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, `id:${item.key}`])),
          created: fragment.entities.length,
          updated: 0,
          links_added: fragment.links?.length ?? 0,
          dropped_keys: [],
        }),
      update_properties: () => Promise.resolve(undefined),
      update_properties_batch: () => Promise.resolve(undefined),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    const envelopes = Array.from({ length: messageCount }, (_, index) => {
      const envelope = messageEnvelope();
      const messageId = index + 1;
      return {
        ...envelope,
        remote_id: `tg:msg:42:${String(messageId)}`,
        payload: { ...envelope.payload, message_id: messageId, text: "plain text" },
      };
    });

    await module.ingest({ envelopes });

    expect(graph.spies.find_by_anchors).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.apply_batch).toHaveBeenCalledTimes(1);
    expect(graph.spies.update_properties_batch).toHaveBeenCalledTimes(1);
  });

  it("preserves the provider-verified self marker when an outgoing sender replica converges", async () => {
    const outgoing = messageEnvelope();
    outgoing.payload.sender_id = 9001;
    outgoing.payload.sender_name = "Operator";
    const graph = mockGraph({
      find_by_anchors: (anchors) => Promise.resolve(anchors.map(() => "chat-entity")),
      get_entities: (ids) =>
        Promise.resolve(ids.map((id) => entity(id, "Chat", {
          schema_id: CHAT,
          properties: { chat_id: 42, type: "private" },
        }))),
      apply_batch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, `id:${item.key}`])),
          created: fragment.entities.length,
          updated: 0,
          links_added: fragment.links?.length ?? 0,
          dropped_keys: [],
        }),
      web_register: () => Promise.resolve("web-id"),
      web_register_batch: (links: readonly unknown[]) => Promise.resolve(links.map(() => "web-id")),
      update_properties: () => Promise.resolve(undefined),
      update_properties_batch: () => Promise.resolve(undefined),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await module.ingest({ envelopes: [outgoing] });

    const applyBatch = graph.spies.apply_batch;
    if (applyBatch === undefined) throw new Error("telegram ingest: apply_batch spy missing");
    const fragment = applyBatch.mock.calls[0]?.[0];
    expect(fragment?.entities).toContainEqual(expect.objectContaining({
      key: "acct:9001",
      anchor: "tg:account:9001",
      properties: expect.objectContaining({ telegram_user_id: 9001, is_self: true }),
    }));
  });

  it("drops identity-less messages within a valid page and emits checks only for live messages", async () => {
    const invalid = messageEnvelope();
    invalid.remote_id = "tg:msg:42:missing";
    delete invalid.payload.message_id;
    const live = messageEnvelope("live");
    const graph = mockGraph({
      // The live message's chat is already known to the graph.
      find_by_anchors: (anchors) => Promise.resolve(anchors.map((anchor) => (anchor === "tg:chat:42" ? "chat-entity-42" : null))),
      apply_batch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, `id:${item.key}`])),
          created: fragment.entities.length,
          updated: 0,
          links_added: fragment.links?.length ?? 0,
          dropped_keys: [],
        }),
      web_register: () => Promise.resolve("web-id"),
      web_register_batch: (links: readonly unknown[]) => Promise.resolve(links.map(() => "web-id")),
      // The live message's chat is known with Telegram's count; the message
      // raises it by one so the plan and the saved count move together.
      get_entities: (ids) => Promise.resolve(ids.map((id) => ({
        ...entity(id, "Chat 42", { schema_id: CHAT }),
        properties: { chat_id: 42, title: "Chat 42", type: "private", message_count: 99 },
      }))),
      update_properties: () => Promise.resolve(),
      update_properties_batch: () => Promise.resolve(),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    const result = await module.ingest({ envelopes: [invalid, live] });
    expect(graph.spies.update_properties_batch).toHaveBeenCalledWith([expect.objectContaining({
      properties: expect.objectContaining({ message_count: 100 }),
    })]);
    expect(result).toEqual({
      dropped_remote_ids: ["tg:msg:42:missing"],
      trigger_checks: [expect.objectContaining({
        type: "trigger.check",
        phase: "live",
        entity_id: "id:tg:msg:42:7",
        user_id: "u1",
        context: {
          text: "Read https://example.test/demo",
          sender_name: "Alice",
          // The backend fires only for events that say when they happened (INV-10).
          occurred_at: "2026-08-12T08:00:00Z",
        },
      })],
    });
  });

  it("deletes by remote anchor and reports failed deletes instead of aborting the page", async () => {
    const envelope: SyncEnvelope = {
      ...messageEnvelope(),
      kind: "delete",
      payload: {},
    };
    const graph = mockGraph({
      find_by_anchor: () => Promise.resolve("message-entity"),
      delete_entity: () => Promise.resolve(undefined),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    await expect(module.ingest({ envelopes: [envelope] })).resolves.toEqual({
      dropped_remote_ids: [],
      trigger_checks: [],
    });
    expect(graph.spies.delete_entity).toHaveBeenCalledWith("message-entity");

    const failing = mountModule(TelegramModule, {
      graph: mockGraph({
        find_by_anchor: () => Promise.resolve("message-entity"),
        delete_entity: () => Promise.reject(new Error("delete failed")),
      }),
    }).module;
    await expect(failing.ingest({ envelopes: [envelope] })).resolves.toEqual({
      dropped_remote_ids: ["tg:msg:42:7"],
      trigger_checks: [],
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
      find_by_anchor: (anchor) => {
        if (anchor === "tg:account:9001") return Promise.resolve(selfExists ? "self-id" : null);
        if (anchor === "tg:chat:42") return Promise.resolve(chatExists ? "chat-id" : null);
        return Promise.resolve(null);
      },
      list_linked: () => Promise.resolve(edgeExists ? {
        items: [{
          entity: entity("self-id", "Me"),
          link: {
            id: "edge-42", from_id: "self-id", to_id: "chat-id", kind: "observed_in",
            validFrom: null, validUntil, metadata: null,
          },
        }],
        total: 1,
      } : { items: [], total: 0 }),
      end_link: (_id, endedAt) => {
        if (endError !== null) return Promise.reject(endError);
        validUntil = endedAt;
        return Promise.resolve(undefined);
      },
      apply_batch: () => Promise.resolve({
        ids: {}, created: 0, updated: 0, links_added: 0, dropped_keys: [],
      }),
    });
    const module = mountModule(TelegramModule, { graph }).module;
    const departure: SyncEnvelope = {
      ...messageEnvelope("live"),
      remote_id: "tg:chat:42",
      payload: {
        entity_type: "telegram_chat",
        chat_id: 42,
        top_message: 0,
        telegram_user_id: 9001,
        valid_until: "2026-09-20T11:22:33+00:00",
      },
    };

    await expect(module.ingest({ envelopes: [departure] })).resolves.toMatchObject({
      dropped_remote_ids: [], trigger_checks: [],
    });
    expect(graph.spies.end_link).toHaveBeenCalledTimes(1);
    expect(graph.spies.end_link).toHaveBeenCalledWith("edge-42", "2026-09-20T11:22:33+00:00");
    expect(graph.spies.apply_batch).not.toHaveBeenCalled();

    await module.ingest({ envelopes: [departure] });
    validUntil = null;
    await module.ingest({
      envelopes: [{ ...departure, payload: { ...departure.payload, telegram_user_id: 7002 } }],
    });
    expect(graph.spies.end_link).toHaveBeenCalledTimes(1);

    for (const field of ["telegram_user_id", "chat_id", "valid_until"] as const) {
      const payload = { ...departure.payload };
      delete payload[field];
      await expect(module.ingest({
        envelopes: [{ ...departure, payload }],
      })).rejects.toThrow(field);
    }
    await expect(module.ingest({
      envelopes: [{ ...departure, payload: { ...departure.payload, valid_until: "not-a-date" } }],
    })).rejects.toThrow("valid_until");
    await expect(module.ingest({
      envelopes: [{ ...departure, payload: { ...departure.payload, valid_until: "2026-09-20T11:22:33" } }],
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
    expect(graph.spies.end_link).toHaveBeenCalledTimes(1);

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
  it("tst_module_telegram_006 resolves a packet's chats through one anchor batch and one entity batch", async () => {
    const known: Record<string, string> = { "tg:chat:1": "chat-1", "tg:chat:2": "chat-2", "tg:chat:4": "chat-4" };
    const stored: Record<string, Record<string, unknown>> = {
      "chat-1": { chat_id: 1, title: "One", avatar_url: "/a/1.jpg" },
      "chat-2": { chat_id: 2, title: "Two", last_message_preview: "kept two", last_sender_name: "Kept" },
      "chat-4": { chat_id: 4, title: "Four", last_message_date: "2026-08-01T00:00:00Z" },
    };
    const graph = mockGraph({
      find_by_anchors: (anchors) => Promise.resolve(anchors.map((anchor) => known[anchor] ?? null)),
      get_entities: (ids) => Promise.resolve(ids.map((id) => ({
        ...entity(id, String(stored[id]?.title ?? ""), { schema_id: CHAT }),
        properties: stored[id] ?? {},
      }))),
      find_by_anchor: (anchor) => anchor === "tg:account:9001"
        ? Promise.resolve("self-id")
        : Promise.reject(new Error("per-chat anchor lookup is forbidden")),
      list_linked: () => Promise.resolve({ items: [], total: 0 }),
      get_entity: () => Promise.reject(new Error("per-chat entity lookup is forbidden")),
      list_entities_window: () => Promise.reject(new Error("whole-account chat scan is forbidden")),
      update_properties: () => Promise.resolve(),
      update_properties_batch: () => Promise.resolve(),
      apply_batch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, `id:${item.key}`])),
          created: 0,
          updated: fragment.entities.length,
          links_added: fragment.links?.length ?? 0,
          dropped_keys: [],
        }),
    });
    const module = mountModule(TelegramModule, { graph, ctx: { extension_id: "telegram" } }).module;
    const chat = (chatId: number): SyncEnvelope => ({
      ...messageEnvelope(),
      remote_id: `tg:chat:${String(chatId)}`,
      payload: { entity_type: "chat", chat_id: chatId, title: `Chat ${String(chatId)}` },
    });
    const message = (chatId: number, id: number): SyncEnvelope => ({
      ...messageEnvelope(),
      remote_id: `tg:msg:${String(chatId)}:${String(id)}`,
      payload: { ...messageEnvelope().payload, message_id: id, chat_id: chatId, text: "plain text" },
    });

    await expect(module.ingest({
      envelopes: [chat(1), chat(2), chat(3), message(1, 8), message(4, 9)],
    })).resolves.toEqual({ dropped_remote_ids: [], trigger_checks: [] });

    expect(graph.spies.find_by_anchors?.mock.calls).toEqual([[["tg:chat:1", "tg:chat:2", "tg:chat:3"]], [["tg:chat:4"]]]);
    expect(graph.spies.get_entities?.mock.calls).toEqual([[["chat-1", "chat-2"]], [["chat-4"]]]);
    // One operator lookup per page; the operator's edge to each of the two
    // existing chats is read once, kind-filtered, before it is written again.
    expect(graph.spies.find_by_anchor?.mock.calls).toEqual([["tg:account:9001"]]);
    expect(graph.spies.list_linked?.mock.calls.map(([spec]) => (spec as { parent_id: string }).parent_id)).toEqual(["chat-1", "chat-2"]);
    expect(graph.spies.get_entity).not.toHaveBeenCalled();
    expect(graph.spies.list_entities_window).not.toHaveBeenCalled();
    const firstBatch = graph.spies.apply_batch?.mock.calls[0]?.[0] as GraphBatchInput | undefined;
    expect(firstBatch?.entities.find((item) => item.key === "tg:chat:2")?.properties).toMatchObject({
      last_message_preview: "kept two",
      last_sender_name: "Kept",
    });
    expect(firstBatch?.entities.find((item) => item.key === "tg:chat:1")?.properties).toMatchObject({ avatar_url: "/a/1.jpg" });
    expect(firstBatch?.entities.find((item) => item.key === "tg:chat:3")?.properties).toEqual({ chat_id: 3, title: "Chat 3" });
    expect(graph.spies.update_properties_batch).toHaveBeenCalledTimes(1);
  });
});
