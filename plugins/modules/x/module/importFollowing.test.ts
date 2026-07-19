// tst_import (plan §7, S5): import_following is a bootstrap TRIGGER — it
// schedules the x source's `contacts` surface via source.sync.bootstrap and
// writes NOTHING itself (INV-ING-1: the data flows envelopes → contacts
// @syncHandler → apply_batch).
import { describe, expect, it, vi } from "vitest";
import type { GraphService, PluginDeps } from "@magnis/plugin-sdk";
import { XModule } from "./service.ts";
import type { XCanonical, XFacets } from "../types/index.ts";

function makeDeps(opts?: { rpcError?: boolean }) {
  const reject =
    (name: string) =>
    (..._a: unknown[]): never => {
      throw new Error(`unexpected graph op on trigger path: ${name}`);
    };
  const rpcExecute = vi.fn(async (method: string) => {
    if (opts?.rpcError) throw new Error("no enabled account for x/contacts — connect first");
    if (method === "source.sync.bootstrap") return { ok: true, seeded: 1 };
    throw new Error(`unexpected rpc ${method}`);
  });
  // EVERY graph op rejects: the trigger must not touch the graph at all.
  const graph = {
    source_command: vi.fn(reject("source_command")),
    apply_batch: vi.fn(reject("apply_batch")),
    add_link: vi.fn(reject("add_link")),
    create_entity: vi.fn(reject("create_entity")),
  } as unknown as GraphService<XFacets, XCanonical>;
  const deps = {
    graph,
    ctx: { extension_id: "x", user_id: "u1", extension_kind: "plugin" },
    util: {},
    rpc: { execute: rpcExecute },
  } as unknown as PluginDeps<XFacets, XCanonical>;
  return { mod: new XModule(deps), rpcExecute, graph };
}

describe("x.import_following (tst_import)", () => {
  it("schedules the contacts-surface bootstrap with the import spec", async () => {
    const { mod, rpcExecute } = makeDeps();
    const r = await mod.import_following({ handle: "0xmikko_eth", limit: 10 });
    expect(r).toEqual({ scheduled: true, surface: "contacts" });
    expect(rpcExecute).toHaveBeenCalledTimes(1);
    expect(rpcExecute).toHaveBeenCalledWith("source.sync.bootstrap", {
      source_id: "x",
      surface: "contacts",
      params: { handle: "0xmikko_eth", limit: 10 },
    });
  });

  it("omits limit from the spec when not given", async () => {
    const { mod, rpcExecute } = makeDeps();
    await mod.import_following({ handle: "me" });
    expect(rpcExecute).toHaveBeenCalledWith("source.sync.bootstrap", {
      source_id: "x",
      surface: "contacts",
      params: { handle: "me" },
    });
  });

  it("writes NOTHING itself — zero graph ops even on the happy path", async () => {
    const { mod, graph } = makeDeps();
    await mod.import_following({ handle: "me" });
    expect(vi.mocked(graph.apply_batch)).not.toHaveBeenCalled();
    expect(vi.mocked(graph.add_link)).not.toHaveBeenCalled();
    expect(vi.mocked(graph.source_command)).not.toHaveBeenCalled();
  });

  it("propagates the host's typed rejection (no account connected)", async () => {
    const { mod } = makeDeps({ rpcError: true });
    await expect(mod.import_following({ handle: "me" })).rejects.toThrow(/no enabled account/);
  });
});
