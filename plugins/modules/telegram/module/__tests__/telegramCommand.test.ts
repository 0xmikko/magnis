/**
 * @layer: module
 * @test-id: tst_module_telegram_command_001
 * @scenario: scn_telegram_command_001
 * @covers: plugins/modules/telegram/module/service.ts::syncStatus,syncReset,composerRead,composerSetText,composerAppendText,messagesBatchSend,messagesBackfill,setTrigger
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
import { mockGraph, mountModule } from "@magnis/testkit/module";
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
  it("delegates sync and composer commands without translating host responses", async () => {
    const graph = mockGraph({
      sync_state: (...args: unknown[]) => Promise.resolve({ args }),
      composer: (...args: unknown[]) => Promise.resolve({ args }),
    });
    const module = mountModule(TelegramModule, { graph }).module;

    await expect(module.syncStatus()).resolves.toEqual({ args: ["status"] });
    await expect(module.syncReset()).resolves.toEqual({ args: ["reset", "telegram.message"] });
    await expect(module.composerRead()).resolves.toEqual({ args: ["read"] });
    await expect(module.composerSetText({ thread_key: "chat:42", text: "Hello" })).resolves.toEqual({
      args: ["set_text", "chat:42", "Hello"],
    });
    await expect(module.composerAppendText({ thread_key: "chat:42", text: " world" })).resolves.toEqual({
      args: ["append_text", "chat:42", " world"],
    });
  });

  it("requests asynchronous backfill with exact source arguments", async () => {
    const graph = mockGraph({ request_backfill: () => Promise.resolve({ pending: true }) });
    const module = mountModule(TelegramModule, { graph }).module;

    await expect(module.messagesBackfill({
      chat_id: 42,
      before_message_id: 100,
      limit: 75,
      account_id: "account-1",
    })).resolves.toEqual({ count: 0, skipped: 0, pending: true });
    expect(graph.spies.request_backfill).toHaveBeenCalledWith({
      action: "backfill_chat",
      chat_id: 42,
      before_message_id: 100,
      limit: 75,
    }, "account-1");
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

  it("resolves the chat anchor and delegates trigger definition ownership", async () => {
    const graph = mockGraph({ find_by_anchor: () => Promise.resolve("chat-entity") });
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
      graph: mockGraph({ find_by_anchor: () => Promise.resolve(null) }),
    }).module;
    await expect(missing.setTrigger({
      chat_id: 42,
      gate_prompt: "g",
      action_prompt: "a",
    })).rejects.toThrow("Telegram chat 42 not found");
  });

  it("publishes send/reply/batch/trigger as approval-required tools", async () => {
    const { tools } = await mountModule(TelegramModule, {
      mode: "dispatch",
      ctx: { extension_id: "telegram" },
    });
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const name of ["telegram.messages.send", "telegram.messages.reply", "telegram.batch_send", "telegram.set_trigger"]) {
      expect(byName.get(name)?.requires_approval).toBe(true);
    }
    expect(byName.has("telegram.messages.backfill")).toBe(false);
  });
});
