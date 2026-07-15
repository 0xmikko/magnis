/**
 * @layer: fe_agent
 * @test-id: tst_fe_agent_005
 *
 * R3 [DEC-4]: telegram.batch_send must capture a PER-RECIPIENT outcome and never
 * throw mid-batch. The original loop pushed only status:"sent" and let a thrown
 * send (e.g. a long FLOOD_WAIT → RATE_LIMITED) abort the whole tool — discarding
 * the already-sent results (the tool promises "per-recipient results") and making
 * a re-approval double-send the delivered ones. runBatchSend isolates each send so
 * a failure is recorded and the loop continues.
 */
import { describe, it, expect, vi } from "vitest";
import { runBatchSend } from "../batchSend";

describe("tst_fe_agent_005 — runBatchSend reports partial results without aborting", () => {
  it("continues past a failed recipient and records per-recipient status", async () => {
    const items = [
      { chat_id: 1, text: "a" },
      { chat_id: 2, text: "b" },
      { chat_id: 3, text: "c" },
    ];
    const send = vi.fn(async (m: { chat_id: number | string }) => {
      if (m.chat_id === 2) throw new Error("RATE_LIMITED:120");
      return { id: `e:${String(m.chat_id)}` };
    });

    const out = await runBatchSend(items, send);

    // The loop did NOT abort at the failing recipient — all three were attempted.
    expect(send).toHaveBeenCalledTimes(3);
    expect(out.total).toBe(3);
    expect(out.sent).toBe(2);
    expect(out.failed).toBe(1);
    expect(out.results.map((r) => r.status)).toEqual(["sent", "failed", "sent"]);
    expect(out.results[1]?.error).toContain("RATE_LIMITED:120");
    expect(out.results[0]?.id).toBe("e:1");
    expect(out.results[2]?.status).toBe("sent");
  });

  it("all-success path returns sent==total, failed==0", async () => {
    const out = await runBatchSend(
      [{ chat_id: 9, text: "x" }],
      async () => ({ id: "e:9" }),
    );
    expect(out).toEqual({
      results: [{ chat_id: 9, status: "sent", id: "e:9" }],
      total: 1,
      sent: 1,
      failed: 0,
    });
  });
});
