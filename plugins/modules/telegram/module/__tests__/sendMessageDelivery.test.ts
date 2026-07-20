/**
 * @layer: fe_agent
 * @test-id: tst_fe_agent_007
 *
 * sendMessage delivers the message via
 * graph.source_command, THEN runs local enrichment (ingest + entity lookup). If
 * that local post-processing throws AFTER a successful delivery, the send must
 * still be reported as succeeded — otherwise a delivered message is recorded
 * "failed" (in a batch or single send) and a manual retry double-sends it. The
 * remote delivery is the source of truth; local enrichment is best-effort.
 *
 * Doubles come from @magnis/testkit/module.
 */
import { describe, it, expect, vi } from "vitest";
import { mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { TelegramModule } from "../service.ts";
import type { SyncEnvelope, TelegramCanonical, TelegramFacets } from "../../types.ts";

type G = MockGraph<TelegramFacets, TelegramCanonical>;

// The private members the test drives / stubs directly.
interface TgInternals {
  sendMessage(
    chatId: number | string,
    text: string,
    replyTo: number | undefined,
    accountId: string | undefined,
  ): Promise<Record<string, unknown>>;
  ingestMessage(env: SyncEnvelope, payload: Record<string, unknown>): Promise<unknown>;
}

function makeModule(): { mod: TgInternals; graph: G } {
  const graph = mockGraph<TelegramFacets, TelegramCanonical>({
    source_command: () => Promise.resolve({ message_id: 777 }),
    find_by_external_id: () => Promise.resolve("ent-1"),
  });
  const mod = mountModule(TelegramModule, { graph, ctx: { extension_id: "telegram" } })
    .module as unknown as TgInternals;
  return { mod, graph };
}

describe("tst_fe_agent_007 — sendMessage: delivery success survives local enrichment failure", () => {
  it("resolves (does NOT reject) when ingest fails after a successful delivery", async () => {
    const { mod, graph } = makeModule();
    vi.spyOn(mod, "ingestMessage").mockRejectedValue(new Error("PGlite write failed"));

    const result = await mod.sendMessage(42, "hi", undefined, "acct");

    expect(graph.spies.source_command).toHaveBeenCalledTimes(1); // the message WAS delivered
    expect(result).toEqual({ message_id: 777 }); // reported as sent, not failed
  });

  it("returns the enriched result (with entity id) on the happy path", async () => {
    const { mod } = makeModule();
    vi.spyOn(mod, "ingestMessage").mockResolvedValue(undefined);

    const result = await mod.sendMessage(42, "hi", undefined, "acct");

    expect(result).toEqual({ message_id: 777, id: "ent-1" });
  });
});
