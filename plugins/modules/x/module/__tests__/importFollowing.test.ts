// tst_import: import_following is a bootstrap TRIGGER — it
// schedules the x source's `contacts` surface via source.sync.bootstrap and
// writes NOTHING itself (the data flows envelopes → contacts
// @syncHandler → apply_batch).
//
// Doubles come from @magnis/testkit/module. The graph is a fully-throwing
// mockGraph: because the trigger must not touch the graph at all, ANY graph op
// would throw `unexpected graph op: …` and fail the test.
import { describe, expect, it, vi } from "vitest";
import { mockGraph, mountModule } from "@magnis/testkit/module";
import { XModule } from "../service.ts";
import type { XCanonical, XFacets } from "../../types.ts";

function mountX(opts?: { rpcError?: boolean }): { mod: XModule; execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn(async (method: string) => {
    if (opts?.rpcError) throw new Error("no enabled account for x/contacts — connect first");
    if (method === "source.sync.bootstrap") return { ok: true, seeded: 1 };
    throw new Error(`unexpected rpc ${method}`);
  });
  const { module } = mountModule<XModule, XFacets, XCanonical>(XModule, {
    graph: mockGraph<XFacets, XCanonical>(),
    ctx: { extension_id: "x" },
    rpc: { execute },
  });
  return { mod: module, execute };
}

describe("x.import_following (tst_import)", () => {
  it("schedules the contacts-surface bootstrap with the import spec", async () => {
    const { mod, execute } = mountX();
    const r = await mod.import_following({ handle: "0xmikko_eth", limit: 10 });
    expect(r).toEqual({ scheduled: true, surface: "contacts" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith("source.sync.bootstrap", {
      source_id: "x",
      surface: "contacts",
      params: { handle: "0xmikko_eth", limit: 10 },
    });
  });

  it("omits limit from the spec when not given", async () => {
    const { mod, execute } = mountX();
    await mod.import_following({ handle: "me" });
    expect(execute).toHaveBeenCalledWith("source.sync.bootstrap", {
      source_id: "x",
      surface: "contacts",
      params: { handle: "me" },
    });
  });

  it("writes NOTHING itself — zero graph ops (throwing mockGraph enforces it)", async () => {
    const { mod } = mountX();
    // Resolves cleanly: had the trigger touched the graph, the throwing mockGraph
    // would have rejected this call.
    await expect(mod.import_following({ handle: "me" })).resolves.toEqual({
      scheduled: true,
      surface: "contacts",
    });
  });

  it("propagates the host's typed rejection (no account connected)", async () => {
    const { mod } = mountX({ rpcError: true });
    await expect(mod.import_following({ handle: "me" })).rejects.toThrow(/no enabled account/);
  });
});
