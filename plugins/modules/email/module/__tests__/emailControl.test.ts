// Stage 5+6 — sync control + reply composer. Thin @rpc wrappers that delegate
// to the host graph ops (sync_state / composer), keyed by the calling module.
// Exercised through @magnis/testkit/module: the passed-in spies are wrapped by
// mockGraph's Proxy (which forwards args to them), so `expect(spy).toHaveBeen…`
// still observes the delegated call; any op NOT provided throws.

import { describe, expect, it, vi } from "vitest";
import type { GraphBatchInput, RpcExecutor } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, type GraphOverrides } from "@magnis/testkit/module";
import { EmailModule } from "../service.ts";
import type { EmailCanonical, EmailFacets } from "../../types.ts";

function makeModule(
  graph: Partial<Record<string, unknown>>,
  rpc: RpcExecutor = { execute: vi.fn() },
): EmailModule {
  return mountModule(EmailModule, {
    graph: mockGraph<EmailFacets, EmailCanonical>(
      graph as unknown as GraphOverrides<EmailFacets, EmailCanonical>,
    ),
    ctx: { extension_id: "email" },
    rpc,
  }).module;
}

describe("email sync control (Stage 5)", () => {
  it("sync.status delegates to graph.sync_state('status')", async () => {
    const sync_state = vi.fn().mockResolvedValue({ accounts: [] });
    const mod = makeModule({ sync_state });
    await mod.syncStatus();
    expect(sync_state).toHaveBeenCalledWith("status");
  });

  it("sync.reset clears ONLY email.message (namespace-scoped)", async () => {
    const sync_state = vi.fn().mockResolvedValue({ ok: true });
    const mod = makeModule({ sync_state });
    await mod.syncReset();
    expect(sync_state).toHaveBeenCalledWith("reset", "email.message");
  });
});

describe("email reply composer (Stage 6)", () => {
  it("composer.read delegates to graph.composer('read')", async () => {
    const composer = vi.fn().mockResolvedValue({ present: false });
    await makeModule({ composer }).composerRead();
    expect(composer).toHaveBeenCalledWith("read");
  });

  it("composer.set_text passes thread_key + text", async () => {
    const composer = vi.fn().mockResolvedValue({ revision: 1 });
    await makeModule({ composer }).composerSetText({ thread_key: "t1", text: "draft" });
    expect(composer).toHaveBeenCalledWith("set_text", "t1", "draft");
  });

  it("composer.append_text passes thread_key + text", async () => {
    const composer = vi.fn().mockResolvedValue({ revision: 2 });
    await makeModule({ composer }).composerAppendText({ thread_key: "t1", text: " more" });
    expect(composer).toHaveBeenCalledWith("append_text", "t1", " more");
  });

  it("composer.set_attachments passes thread_key + attachment_ids (no text)", async () => {
    const composer = vi.fn().mockResolvedValue({ revision: 3 });
    await makeModule({ composer }).composerSetAttachments({ thread_key: "t1", attachment_ids: ["f1", "f2"] });
    expect(composer).toHaveBeenCalledWith("set_attachments", "t1", undefined, ["f1", "f2"]);
  });
});

describe("email ensure_address hub RPC (cross-module)", () => {
  it("resolves-or-creates email.address via apply_batch and returns the id", async () => {
    const apply_batch = vi.fn(async (frag: { entities: { key: string; schema_id: string; facets: { external_id?: string }[] }[] }) => ({
      ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
      created: 1,
      updated: 0,
      links_added: 0,
      dropped_keys: [],
    }));
    const mod = makeModule({ apply_batch });
    const out = await mod.ensureAddress({ address: "Alice@Example.com", display_name: "Alice" });

    expect(out).toEqual({ id: "id-addr" });
    const frag = apply_batch.mock.calls[0][0];
    const addr = frag.entities[0];
    expect(addr.schema_id).toBe("email.address");
    expect(addr.facets[0].external_id).toBe("email:address:alice@example.com"); // lowercased hub key
  });

  it("rejects an empty address", async () => {
    const mod = makeModule({ apply_batch: vi.fn() });
    await expect(mod.ensureAddress({ address: "   " })).rejects.toThrow(/required/);
  });
});

describe("email set_trigger (Stage 7)", () => {
  it("normalizes addresses, resolves them via apply_batch, delegates to triggers.create", async () => {
    const apply_batch = vi.fn(async (frag: GraphBatchInput) => ({
      ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
      created: frag.entities.length,
      updated: 0,
      links_added: 0,
      dropped_keys: [],
    }));
    const execute = vi.fn().mockResolvedValue({ id: "trig-1" });
    const mod = makeModule({ apply_batch }, { execute });

    await mod.setTrigger({
      from_addresses: ["B@X.com", "a@x.com", "a@x.com"], // mixed case + dup
      from_address: "C@x.com",
      gate_prompt: "is it urgent",
      action_prompt: "notify me",
    });

    // resolve-or-create email.address entities (lowercased, deduped, sorted)
    const frag = apply_batch.mock.calls[0][0] as GraphBatchInput;
    expect(frag.entities.map((e) => e.idx)).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(frag.entities.every((e) => e.schema_id === "email.address")).toBe(true);

    // delegate to triggers.create with resolved watch ids + schema_filter "email"
    expect(execute).toHaveBeenCalledTimes(1);
    const [method, params] = execute.mock.calls[0] as [string, Record<string, unknown>];
    expect(method).toBe("triggers.create");
    expect(params.watch_entity_ids).toEqual(["id-addr:a@x.com", "id-addr:b@x.com", "id-addr:c@x.com"]);
    expect(params.schema_filter).toBe("email");
    expect(params.gate_prompt).toBe("is it urgent");
    expect(params.debounce_seconds).toBe(0);
  });

  it("throws when no addresses are provided", async () => {
    const mod = makeModule({ apply_batch: vi.fn() }, { execute: vi.fn() });
    await expect(
      mod.setTrigger({ from_addresses: [], gate_prompt: "g", action_prompt: "a" }),
    ).rejects.toThrow(/missing from_addresses/);
  });
});
