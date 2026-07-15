/**
 * @layer: fe_agent
 * @test-id: tst_fe_agent_007
 *
 * R3-followup [Codex round-2]: sendMessage delivers the message via
 * graph.source_command, THEN runs local enrichment (ingest + entity lookup). If
 * that local post-processing throws AFTER a successful delivery, the send must
 * still be reported as succeeded — otherwise a delivered message is recorded
 * "failed" (in a batch or single send) and a manual retry double-sends it. The
 * remote delivery is the source of truth; local enrichment is best-effort.
 */
import { describe, it, expect, vi } from "vitest";
import { TelegramModule } from "../service.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeModule() {
  const graph = {
    source_command: vi.fn(async () => ({ message_id: 777 })),
    find_by_external_id: vi.fn(async () => "ent-1"),
  } as any;
  const rpc = { execute: vi.fn() } as any;
  const mod = new (TelegramModule as any)({ graph, rpc });
  return { mod, graph };
}

describe("tst_fe_agent_007 — sendMessage: delivery success survives local enrichment failure", () => {
  it("resolves (does NOT reject) when ingest fails after a successful delivery", async () => {
    const { mod, graph } = makeModule();
    vi.spyOn(mod as any, "ingestMessage").mockRejectedValue(new Error("PGlite write failed"));

    const result = await (mod as any).sendMessage(42, "hi", undefined, "acct");

    expect(graph.source_command).toHaveBeenCalledTimes(1); // the message WAS delivered
    expect(result).toEqual({ message_id: 777 }); // reported as sent, not failed
  });

  it("returns the enriched result (with entity id) on the happy path", async () => {
    const { mod } = makeModule();
    vi.spyOn(mod as any, "ingestMessage").mockResolvedValue(undefined);

    const result = await (mod as any).sendMessage(42, "hi", undefined, "acct");

    expect(result).toEqual({ message_id: 777, id: "ent-1" });
  });
});
