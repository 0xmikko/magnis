/**
 * @layer: module
 * @test-id: tst_module_telegram_ingest_002
 * @scenario: scn_telegram_ingest_001
 * @covers: plugins/modules/telegram/module/service.ts::onConnectionReady,ingest,onSyncComplete
 * @deterministic: yes
 * @fixtures: fixed source envelopes and strict graph doubles
 * @legacy-id: tst_be_tgingest_003
 * @legacy-id: tst_be_tgbatch_020
 * @legacy-id: tst_be_tgingest_018
 * @legacy-id: tst_be_tgingest_019
 * @legacy-id: tst_be_tgcontact_004b
 * @legacy-id: tst_be_tgcontact_004c
 * @legacy-id: tst_be_tgdelete_004d
 * @legacy-id: tst_be_tgweb_006
 * @legacy-id: tst_be_tgmedia_007
 * @legacy-id: tst_be_tgmedia_007b
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

  it("maps message/account nodes and structural links in one batch", async () => {
    const graph = mockGraph({
      find_by_anchor: () => Promise.resolve("chat-entity"),
      get_entity: () =>
        Promise.resolve(entity("chat-entity", "Chat", { schema_id: CHAT, properties: { chat_id: 42, type: "private" } })),
      apply_batch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, `id:${item.key}`])),
          created: fragment.entities.length,
          updated: 0,
          links_added: fragment.links?.length ?? 0,
          dropped_keys: [],
        }),
      web_register: () => Promise.resolve("web-id"),
      update_properties: () => Promise.resolve(undefined),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    const result = await module.ingest({ envelopes: [messageEnvelope()] });

    expect(result).toEqual({ ok: true, dropped_remote_ids: [], trigger_checks: [] });
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
    expect(graph.spies.web_register).toHaveBeenCalledWith({
      url: "https://example.test/demo",
      parent_entity_id: "id:tg:msg:42:7",
      link_kind: "references",
    });
  });

  it("drops identity-less messages within a valid page and emits checks only for live messages", async () => {
    const invalid = messageEnvelope();
    invalid.remote_id = "tg:msg:42:missing";
    delete invalid.payload.message_id;
    const live = messageEnvelope("live");
    const graph = mockGraph({
      find_by_anchor: () => Promise.resolve(null),
      apply_batch: (fragment) =>
        Promise.resolve({
          ids: Object.fromEntries(fragment.entities.map((item) => [item.key, `id:${item.key}`])),
          created: fragment.entities.length,
          updated: 0,
          links_added: fragment.links?.length ?? 0,
          dropped_keys: [],
        }),
      web_register: () => Promise.resolve("web-id"),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    const result = await module.ingest({ envelopes: [invalid, live] });
    expect(result).toMatchObject({
      ok: false,
      dropped_remote_ids: ["tg:msg:42:missing"],
      trigger_checks: [expect.objectContaining({
        type: "trigger.check",
        phase: "live",
        entity_id: "id:tg:msg:42:7",
        user_id: "u1",
        context: { text: "Read https://example.test/demo", sender_name: "Alice" },
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
    await expect(module.ingest({ envelopes: [envelope] })).resolves.toMatchObject({ ok: true });
    expect(graph.spies.delete_entity).toHaveBeenCalledWith("message-entity");

    const failing = mountModule(TelegramModule, {
      graph: mockGraph({
        find_by_anchor: () => Promise.resolve("message-entity"),
        delete_entity: () => Promise.reject(new Error("delete failed")),
      }),
    }).module;
    await expect(failing.ingest({ envelopes: [envelope] })).resolves.toMatchObject({
      ok: false,
      dropped_remote_ids: ["tg:msg:42:7"],
    });
  });

  it("decays missing memberships and restores reported memberships", async () => {
    const graph = mockGraph({
      find_by_anchor: () => Promise.resolve("self-id"),
      list_links_for_entity: () =>
        Promise.resolve([
          { id: "leave", from_id: "self-id", to_id: "chat-1", kind: "observed_in", status: "canonical" },
          { id: "rejoin", from_id: "self-id", to_id: "chat-2", kind: "observed_in", status: "decayed" },
        ]),
      get_entity: (id: string) =>
        Promise.resolve(entity(id, id, { schema_id: CHAT, properties: { chat_id: id === "chat-1" ? 1 : 2 } })),
      set_link_status: () => Promise.resolve(undefined),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await expect(module.onSyncComplete({
      user_id: "u1",
      source_id: "telegram-ts",
      account_id: "a1",
      identity_key: "9001",
      observed_remote_ids: ["tg:chat:2"],
    })).resolves.toEqual({ decayed: 1, restored: 1 });
    const setLinkStatus = graph.spies.set_link_status;
    if (setLinkStatus === undefined) throw new Error("sync complete: set_link_status spy missing");
    expect(setLinkStatus.mock.calls.map(([id, status]) => [id, status])).toEqual([
      ["leave", "decayed"],
      ["rejoin", "canonical"],
    ]);
  });
});
