/**
 * @layer: module
 * @test-id: tst_module_telegram_command_001
 * @scenario: scn_telegram_command_001
 * @covers: modules/telegram/module/service.ts::syncStatus,syncReset,composerRead,composerSetText,composerAppendText,messagesBatchSend,messagesBackfill,setTrigger
 * @deterministic: yes
 * @fixtures: strict graph/RPC doubles; no connector process
 * @legacy-id: tst_be_tgsync_012
 * @legacy-id: tst_be_tgcomposer_012
 * @legacy-id: tst_be_tgtrigger_013
 * @legacy-id: tst_be_tgsync_011_reset_deletes_messages
 * @legacy-id: tst_be_tgsync_012_status_lists_state
 * @legacy-id: tst_be_tgcomposer_012_read_and_set
 * @legacy-id: tst_be_tgtrigger_013_set_trigger_creates_trigger
 */
import { describe, expect, it, vi } from "vitest";
import { entityId, entity, mockGraph, mountModule, syncStateDouble } from "@magnis/testkit/module";
import { TelegramModule } from "../service.ts";

interface TelegramCommandInternals {
  sendMessage(
    chatId: number | string,
    text: string,
    replyTo: number | undefined,
    accountId: string | undefined,
  ): Promise<Record<string, unknown>>;
}

describe("tst_module_telegram_command_001 — Telegram command mapping", () => {
  it.each([true, false])("delegates an account identity only to its existing direct chat (exists: %s)", async (exists) => {
    const graph = mockGraph({
      getEntity: (id) => Promise.resolve(id === entityId("identity") ? entity(id, "Person", { schemaId: "telegram.account", properties: { telegram_user_id: 42 } }) : entity(id, "DM", { schemaId: "telegram.chat", properties: { chat_id: 42, type: "private" } })),
      findByExternalId: () => Promise.resolve(exists ? entityId("chat-id") : null),
      updateEntitySyncEnabled: () => Promise.resolve({ syncRevision: "8" }),
      syncState: syncStateDouble(),
    });
    const mounted = await mountModule(TelegramModule, { mode: "dispatch", graph, ctx: { extensionId: "telegram" } });
    const result = await mounted.rpc("telegram.account.setSyncEnabled", { id: entityId("identity"), syncEnabled: true });
    expect(graph.spies.findByExternalId).toHaveBeenCalledWith("tg:chat:42");
    expect(result).toEqual({ results: [exists ? {
      identityId: entityId("identity"), targetId: entityId("chat-id"), kind: "saved", syncEnabled: true, syncRevision: "8", application: { kind: "pending" },
    } : { identityId: entityId("identity"), targetId: null, kind: "failed", message: "Telegram identity has no stored direct chat" }] });
    if (exists) expect(graph.spies.updateEntitySyncEnabled).toHaveBeenCalledExactlyOnceWith({ id: entityId("chat-id"), syncEnabled: true });
    else expect(graph.spies.updateEntitySyncEnabled).not.toHaveBeenCalled();
  });

  it("reports persistence failure without requesting worker application", async () => {
    const graph = mockGraph({
      getEntity: () => Promise.resolve(entity(entityId("chat-id"), "Chat", { schemaId: "telegram.chat" })),
      updateEntitySyncEnabled: () => Promise.reject(new Error("save failed")),
      syncState: syncStateDouble(),
    });
    const mounted = await mountModule(TelegramModule, { mode: "dispatch", graph, ctx: { extensionId: "telegram" } });
    await expect(mounted.rpc("telegram.chat.setSyncEnabled", { id: entityId("chat-id"), syncEnabled: true })).resolves.toEqual({ results: [{ identityId: entityId("chat-id"), targetId: entityId("chat-id"), kind: "failed", message: "save failed" }] });
    expect(graph.spies.syncState).not.toHaveBeenCalled();
  });

  it.each([false, true])("saves the chat choice before requesting application (apply fails: %s)", async (applyFails) => {
    const calls: string[] = [];
    const graph = mockGraph({
      getEntity: () => Promise.resolve(entity(entityId("chat-id"), "Chat", { schemaId: "telegram.chat" })),
      updateEntitySyncEnabled: () => { calls.push("save"); return Promise.resolve({ syncRevision: "9" }); },
      syncState: syncStateDouble({ apply: () => { calls.push("apply"); return applyFails ? Promise.reject(new Error("worker unavailable")) : Promise.resolve({ pending: true }); } }),
    });
    const mounted = await mountModule(TelegramModule, { mode: "dispatch", graph, ctx: { extensionId: "telegram" } });
    expect(mounted.tools.find((entry) => entry.name === "telegram.chat.setSyncEnabled")?.requiresApproval).toBe(true);
    await expect(mounted.rpc("telegram.chat.setSyncEnabled", { id: entityId("chat-id"), syncEnabled: false })).resolves.toEqual({ results: [{
      identityId: entityId("chat-id"), targetId: entityId("chat-id"), kind: "saved", syncEnabled: false, syncRevision: "9",
      application: applyFails ? { kind: "failed", message: "worker unavailable" } : { kind: "pending" },
    }] });
    expect(calls).toEqual(["save", "apply"]);
    expect(graph.spies.updateEntitySyncEnabled).toHaveBeenCalledWith({ id: entityId("chat-id"), syncEnabled: false });
  });

  it("delegates sync and composer commands without translating host responses", async () => {
    const status = { accounts: [{ accountId: "account-1", sync: null }] };
    const reset = { status: "ok" as const, deletedMessages: 3 };
    const resets: string[] = [];
    const graph = mockGraph({
      syncState: syncStateDouble({
        status: () => Promise.resolve(status),
        reset: (resetSchema) => { resets.push(resetSchema); return Promise.resolve(reset); },
      }),
      composer: (...args: unknown[]) => Promise.resolve({ args }),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await expect(module.syncStatus()).resolves.toBe(status);
    await expect(module.syncReset()).resolves.toBe(reset);
    expect(resets).toEqual(["telegram.message"]);
    await expect(module.composerRead()).resolves.toEqual({ args: ["read"] });
    await expect(module.composerSetText({ thread_key: "chat:42", text: "Hello" })).resolves.toEqual({
      args: ["set_text", "chat:42", "Hello"],
    });
    await expect(module.composerAppendText({ thread_key: "chat:42", text: " world" })).resolves.toEqual({
      args: ["append_text", "chat:42", " world"],
    });
  });

  /** @test-id: tst_mod_tg_backfill_wake_001
   * @scenario: scn_telegram_command_001
   * @covers: TelegramModule.messagesBackfill generic graph wake
   * @deterministic: yes
   * @fixtures: strict graph double; no connector process
   */
  it("tst_mod_tg_backfill_wake_001 requests asynchronous backfill without provider payload", async () => {
    const graph = mockGraph({ requestBackfill: () => Promise.resolve({ pending: true }) });
    const module = mountModule(TelegramModule, { graph }).module;

    await expect(module.messagesBackfill({
      chat_id: 42,
      before_message_id: 100,
      account_id: "account-1",
    })).resolves.toEqual({ count: 0, skipped: 0, pending: true });
    expect(graph.spies.requestBackfill).toHaveBeenCalledWith({}, "account-1");
  });

  it("validates batch input before sending and honors excluded recipients", async () => {
    const module = mountModule(TelegramModule, { graph: mockGraph() }).module;
    await expect(module.messagesBatchSend({ messages: [] })).rejects.toThrow("batch size must be 1..=50");
    await expect(
      module.messagesBatchSend({ messages: [{ chat_id: "", text: "hello" }] }),
    ).rejects.toThrow("message[0]: missing chat_id");

    const internals = module as unknown as TelegramCommandInternals;
    const sendMessage = vi.spyOn(internals, "sendMessage").mockResolvedValue({ id: "sent-id" });
    const result = await module.messagesBatchSend({
      messages: [
        { chat_id: 1, text: "first" },
        { chat_id: 2, text: "excluded" },
      ],
      excluded_indices: [1],
      account_id: "account-1",
    });
    expect(result).toEqual({
      results: [{ chat_id: 1, status: "sent", id: "sent-id" }],
      total: 1,
      sent: 1,
      failed: 0,
    });
    expect(sendMessage).toHaveBeenCalledWith(1, "first", undefined, "account-1");
  });

  it("resolves the chat by its external id and delegates trigger definition ownership", async () => {
    const graph = mockGraph({ findByExternalId: () => Promise.resolve("chat-entity"), getEntityFull: () => Promise.resolve({ entity: entity("episode-1", "Parent", { schemaId: "episodes.episode" }), links: [] }) });
    const execute = vi.fn(() => Promise.resolve({ id: "trigger-1" }));
    const module = mountModule(TelegramModule, { graph, rpc: { execute } }).module;

    await expect(module.setTrigger({
      chat_id: 42,
      gate_prompt: "investor replied",
      action_prompt: "notify me",
      debounce_seconds: 30,
      episode_id: "episode-1",
    })).resolves.toEqual({ id: "trigger-1" });
    expect(execute).toHaveBeenCalledWith("triggers.create", {
      name: "Telegram trigger: chat 42",
      watch_entity_ids: ["chat-entity"],
      gate_prompt: "investor replied",
      action_prompt: "notify me",
      schema_filter: "telegram",
      debounce_seconds: 30,
      episode_id: "episode-1",
    });

    const missing = mountModule(TelegramModule, {
      graph: mockGraph({ findByExternalId: () => Promise.resolve(null) }),
    }).module;
    await expect(missing.setTrigger({
      chat_id: 42,
      gate_prompt: "g",
      action_prompt: "a",
    })).rejects.toThrow("Telegram chat 42 not found");
  });

  it("publishes one create operation while retaining old names only as client RPCs", async () => {
    const { tools } = await mountModule(TelegramModule, {
      mode: "dispatch",
      ctx: { extensionId: "telegram" },
    });
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    expect(byName.get("telegram.message.create")).toMatchObject({ requiresApproval: true, binding: { entity: "telegram.message", operation: "create" } });
    for (const name of ["telegram.messages.send", "telegram.messages.reply", "telegram.batch_send", "telegram.set_trigger"]) expect(byName.has(name)).toBe(false);
    expect(byName.has("telegram.messages.backfill")).toBe(false);
  });
});

/** @test-id: tst_module_telegram_create_001
 * @scenario: scn_tools_entity_registration
 * @covers: modules/telegram/module/service.ts::TelegramModule.create
 * @deterministic: yes — provider double, local ingest is independently covered
 */
it("tst_module_telegram_create_001 preserves replies and one batch while rejecting mixed forms", async () => {
  const sourceCommand = vi.fn().mockResolvedValue({ message_id: 10 });
  const module = mountModule(TelegramModule, { graph: mockGraph({ sourceCommand, syncState: syncStateDouble({ status: async () => ({ accounts: [{ accountId: "acct", sync: null }] }) }) }) }).module;
  await module.create({ chat_id: 42, reply_to_message_id: 7, text: "Confirmed." });
  expect(sourceCommand).toHaveBeenCalledWith({ action: "send_message", chat_id: 42, reply_to_message_id: 7, text: "Confirmed." }, "acct");
  const result = await module.create({ messages: [{ chat_id: 43, text: "First" }, { chat_id: 44, text: "Skip" }], excluded_indices: [1] });
  expect(result).toMatchObject({ total: 1, sent: 1, failed: 0 });
  expect(sourceCommand).toHaveBeenCalledTimes(2);
  await expect(module.create({ chat_id: 42, text: "Mixed", messages: [{ chat_id: 44, text: "Bad" }] })).rejects.toThrow("form");
  expect(sourceCommand).toHaveBeenCalledTimes(2);
});
