/**
 * @layer: fe_agent
 * @test-id: tst_fe_agent_007
 * @scenario: scn_telegram_command_001
 * @covers: TelegramModule.sendMessage
 * @legacy-id: tst_be_tgsend_008_send_routes_and_ingests
 * @legacy-id: tst_be_tgsend_009_send_explicit_account_routes_cross_named
 * @deterministic: yes
 *
 * sendMessage delivers the message via
 * graph.sourceCommand, THEN runs local enrichment (ingest + entity lookup). If
 * that local post-processing throws AFTER a successful delivery, the send must
 * still be reported as succeeded — otherwise a delivered message is recorded
 * "failed" (in a batch or single send) and a manual retry double-sends it. The
 * remote delivery is the source of truth; local enrichment is best-effort.
 *
 * Doubles come from @magnis/testkit/module.
 */
import { describe, it, expect, vi } from "vitest";
import { entityId, entityRead, entityExtras, entity, mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { TelegramModule } from "../service.ts";
import type { SyncEnvelope } from "@magnis/sdk";
import type { TelegramCanonical } from "../../types.ts";

type G = MockGraph;

// The private members the test drives / stubs directly.
interface TgInternals {
  sendMessage(
    chatId: number | string,
    text: string,
    replyTo: number | undefined,
    accountId: string | undefined,
  ): Promise<Record<string, unknown>>;
  ingestMessageBatch(
    messages: { env: SyncEnvelope; payload: Record<string, unknown> }[],
    triggers: unknown[],
  ): Promise<unknown>;
}

function makeModule(syncEnabled = true): { mod: TgInternals; graph: G } {
  const graph = mockGraph({
    sourceCommand: () => Promise.resolve({ message_id: 777 }),
    findByExternalId: () => Promise.resolve(entityId("ent-1")),
    getEntity: () => Promise.resolve(entityRead(entity("chat-entity", "Chat", { schemaId: "telegram.chat", properties: { chat_id: 42 } }), entityExtras({ syncEnabled, syncRevision: "0" }))),
  });
  const mod = mountModule(TelegramModule, { graph, ctx: { extensionId: "telegram" } })
    .module as unknown as TgInternals;
  return { mod, graph };
}

describe("tst_fe_agent_007 — sendMessage: delivery success survives local enrichment failure", () => {
  it("delivers a message to a stopped chat without ingesting the Source response", async () => {
    const { mod, graph } = makeModule(false);
    const ingest = vi.spyOn(mod, "ingestMessageBatch").mockResolvedValue(undefined);
    await expect(mod.sendMessage(42, "hi", undefined, "acct")).resolves.toEqual({ message_id: 777 });
    expect(graph.spies.sourceCommand).toHaveBeenCalledExactlyOnceWith({ action: "send_message", chat_id: 42, text: "hi" }, "acct");
    expect(ingest).not.toHaveBeenCalled();
  });

  it("resolves (does NOT reject) when ingest fails after a successful delivery", async () => {
    const { mod, graph } = makeModule();
    vi.spyOn(mod, "ingestMessageBatch").mockRejectedValue(new Error("PGlite write failed"));

    const result = await mod.sendMessage(42, "hi", undefined, "acct");

    expect(graph.spies.sourceCommand).toHaveBeenCalledTimes(1); // the message WAS delivered
    expect(result).toEqual({ message_id: 777 }); // reported as sent, not failed
  });

  it("returns the enriched result (with entity id) on the happy path", async () => {
    const { mod } = makeModule();
    vi.spyOn(mod, "ingestMessageBatch").mockResolvedValue(undefined);

    const result = await mod.sendMessage(42, "hi", undefined, "acct");

    expect(result).toEqual({ message_id: 777, id: entityId("ent-1") });
  });
});
