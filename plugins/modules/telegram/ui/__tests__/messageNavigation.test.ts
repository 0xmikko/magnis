/**
 * Navigating to a message needs the message's chat. The module knew the answer
 * and was asked last: the UI called `graph.entity.get` unconditionally and fell
 * back to `telegram.messages.get` only for metadata. Now `messages.get` returns
 * the links, so one module call answers both halves and the generic graph read
 * is gone.
 *
 * @layer: mod_tg
 * @test-id: tst_mod_tg_002
 * @scenario: scn_telegram_002
 * @covers plugins/modules/telegram/ui/index.tsx::TelegramModule.navigateToEntity
 * @deterministic hand-built runtime double; no clock, no network
 *
 * INV-P4.2 message navigation makes one module call and no `graph.entity.get`.
 */
import { describe, expect, it, vi, type Mock } from "vitest";
import type { AppRuntime } from "@magnis/host/runtime";
import { TelegramModule } from "../index";

const MESSAGE_ID = "m1";
const CHAT_ID = "c1";
type Navigate = (moduleId: string, entityType?: string, entityId?: string) => void;

function harness(): {
  readonly runtime: AppRuntime;
  readonly rpc: ReturnType<typeof vi.fn>;
  readonly navigate: Mock<Navigate>;
  readonly setSelectedChatId: ReturnType<typeof vi.fn>;
  readonly setPendingMessageId: ReturnType<typeof vi.fn>;
} {
  const setSelectedChatId = vi.fn();
  const setPendingMessageId = vi.fn();
  // `graph.entity.get` is deliberately absent: reaching for it rejects, and the
  // call count assertion below names it explicitly.
  const rpc = vi.fn((method: string) => {
    if (method === "telegram.messages.get") {
      return Promise.resolve({
        metadata: { message_id: 42 },
        linked_entities: [
          { id: CHAT_ID, schema_id: "telegram.chat" },
          { id: "a1", schema_id: "telegram.account" },
        ],
      });
    }
    return Promise.reject(new Error(`unexpected RPC: ${method}`));
  });
  const store = {
    getState: () => ({ actions: { setSelectedChatId, setPendingMessageId } }),
  };
  return {
    rpc,
    navigate: vi.fn<Navigate>(),
    setSelectedChatId,
    setPendingMessageId,
    runtime: {
      transport: { rpc },
      stores: { get: () => store },
    } as unknown as AppRuntime,
  };
}

describe("tst_mod_tg_002 — navigation asks the module, once", () => {
  it("reads the chat from telegram.messages.get and never calls graph.entity.get", async () => {
    const { runtime, rpc, navigate, setSelectedChatId, setPendingMessageId } = harness();
    // `defineModule` files the handler under the module's agent contribution,
    // which is where the host's registry reads it from.
    const navigateToEntity = TelegramModule.agent?.navigateToEntity;
    expect(navigateToEntity, "the telegram module contributes navigation").toBeTruthy();
    if (navigateToEntity === undefined) throw new Error("no navigateToEntity");

    // Argument order is the registry's: (entityId, schemaId, …). No `metadata`
    // on the card data, so the telegram message id has to come from the module
    // call too — one call answers both halves.
    await navigateToEntity(MESSAGE_ID, "telegram.message", { id: MESSAGE_ID }, runtime, navigate);

    const methods = rpc.mock.calls.map(([method]) => method);
    expect(methods).toEqual(["telegram.messages.get"]);
    expect(methods).not.toContain("graph.entity.get");

    expect(setSelectedChatId).toHaveBeenCalledWith(CHAT_ID);
    expect(setPendingMessageId).toHaveBeenCalledWith(MESSAGE_ID, 42);
    expect(navigate).toHaveBeenCalledWith("telegram", "chat", CHAT_ID);
  });
});
