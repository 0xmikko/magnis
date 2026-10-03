// Sync control + reply composer. Thin @rpc wrappers that delegate
// to the host graph ops (syncState / composer), keyed by the calling module.
// Exercised through @magnis/testkit/module: the passed-in spies are wrapped by
// mockGraph's Proxy (which forwards args to them), so `expect(spy).toHaveBeen…`
// still observes the delegated call; any op NOT provided throws.

/**
 * @test-id: tst_module_email_control_001
 * @scenario: scn_backend_tests_006
 * @covers: EmailModule.ensureAddress, EmailModule.setTrigger
 * @legacy-id: tst_int_email_ensureaddr_001_idempotent
 * @legacy-id: tst_int_trig_030_ensure_address_entity_creates_on_first_call
 * @legacy-id: tst_int_trig_031_ensure_address_entity_returns_existing
 * @legacy-id: tst_int_trig_032_contacts_create_creates_address_entity_and_link
 * @legacy-id: tst_int_trig_034_full_cycle_contact_trigger_email
 * @legacy-id: tst_int_trig_041_multi_address_trigger
 * @legacy-id: tst_int_trig_042_single_address_compat
 * @legacy-id: tst_int_trig_043_merged_deduped_sorted
 * @legacy-id: tst_int_trig_044_no_address_error
 * @deterministic: yes
 */

import { describe, expect, it, vi } from "vitest";
import type { RpcExecutor } from "@magnis/plugin-sdk";
import type { GraphBatchInput } from "@magnis/sdk";
import { mockGraph, mountModule, type GraphOverrides } from "@magnis/testkit/module";
import { EmailModule } from "../service.ts";
import type { EmailCanonical } from "../../types.ts";

function makeModule(
  graph: Partial<Record<string, unknown>>,
  rpc: RpcExecutor = { execute: vi.fn() },
): EmailModule {
  return mountModule(EmailModule, {
    graph: mockGraph(
      graph as unknown as GraphOverrides,
    ),
    ctx: { extensionId: "email" },
    rpc,
  }).module;
}

describe("email sync control", () => {
  it("sync.status delegates to graph.syncState('status')", async () => {
    const syncState = vi.fn().mockResolvedValue({ accounts: [] });
    const mod = makeModule({ syncState });
    await mod.syncStatus();
    expect(syncState).toHaveBeenCalledWith("status");
  });

  it("sync.reset clears ONLY email.message (namespace-scoped)", async () => {
    const syncState = vi.fn().mockResolvedValue({ ok: true });
    const mod = makeModule({ syncState });
    await mod.syncReset();
    expect(syncState).toHaveBeenCalledWith("reset", "email.message");
  });
});

describe("email reply composer", () => {
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
  it("resolves-or-creates email.address via applyBatch and returns the id", async () => {
    const applyBatch = vi.fn(async (frag: GraphBatchInput) => ({
      ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
      created: 1,
      updated: 0,
      linksAdded: 0,
      droppedKeys: [],
    }));
    const mod = makeModule({ applyBatch });
    const out = await mod.ensureAddress({ address: "Alice@Example.com", display_name: "Alice" });

    // S3: the batch key is the lowered address; the node's external id is
    // the email:address chokepoint key.
    expect(out).toEqual({ id: "id-alice@example.com" });
    const call0 = applyBatch.mock.calls[0];
    if (call0 === undefined) throw new Error("ensure_address: applyBatch not called");
    const frag = call0[0];
    const addr = frag.entities[0];
    if (addr === undefined) throw new Error("ensure_address: missing address entity");
    expect(addr.schemaId).toBe("email.address");
    // S5: the address node is its DICTIONARY under the chokepoint external id —
    // the details record retired with the writer.
    expect(addr.externalId).toBe("email:address:alice@example.com");
    expect(addr.properties).toMatchObject({ address: "alice@example.com" });
  });

  it("rejects an empty address", async () => {
    const mod = makeModule({ applyBatch: vi.fn() });
    await expect(mod.ensureAddress({ address: "   " })).rejects.toThrow(/required/);
  });
});

describe("email set_trigger", () => {
  it("normalizes addresses, resolves them via applyBatch, delegates to triggers.create", async () => {
    const applyBatch = vi.fn(async (frag: GraphBatchInput) => ({
      ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
      created: frag.entities.length,
      updated: 0,
      linksAdded: 0,
      droppedKeys: [],
    }));
    const execute = vi.fn().mockResolvedValue({ id: "trig-1" });
    const mod = makeModule({ applyBatch }, { execute });

    await mod.setTrigger({
      from_addresses: ["B@X.com", "a@x.com", "a@x.com"], // mixed case + dup
      from_address: "C@x.com",
      gate_prompt: "is it urgent",
      action_prompt: "notify me",
    });

    // resolve-or-create email.address entities (lowercased, deduped, sorted)
    const call0 = applyBatch.mock.calls[0];
    if (call0 === undefined) throw new Error("set_trigger: applyBatch not called");
    const frag = call0[0] as GraphBatchInput;
    expect(frag.entities.map((e) => e.idx)).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(frag.entities.every((e) => e.schemaId === "email.address")).toBe(true);

    // delegate to triggers.create with resolved watch ids + schema_filter "email"
    expect(execute).toHaveBeenCalledTimes(1);
    const [method, params] = execute.mock.calls[0] as [string, Record<string, unknown>];
    expect(method).toBe("triggers.create");
    expect(params.watch_entity_ids).toEqual(["id-a@x.com", "id-b@x.com", "id-c@x.com"]);
    expect(params.schema_filter).toBe("email");
    expect(params.gate_prompt).toBe("is it urgent");
    expect(params.debounce_seconds).toBe(0);
  });

  it("throws when no addresses are provided", async () => {
    const mod = makeModule({ applyBatch: vi.fn() }, { execute: vi.fn() });
    await expect(
      mod.setTrigger({ from_addresses: [], gate_prompt: "g", action_prompt: "a" }),
    ).rejects.toThrow(/missing from_addresses/);
  });
});

/** @test-id: tst_module_email_trigger_validation_001
 * @scenario: scn_tools_trigger_forms
 * @covers: modules/email/module/service.ts::EmailModule.setTrigger
 * @deterministic: yes — rejected parent before owner writes
 */
it("tst_module_email_trigger_validation_001 compatibility trigger refuses invalid settings and foreign parent before addresses", async () => {
  const applyBatch = vi.fn();
  const execute = vi.fn();
  const module = makeModule({ applyBatch, getEntityFull: vi.fn().mockResolvedValue(null) }, { execute });
  await expect(module.setTrigger({ from_addresses: ["morgan@example.test"], gate_prompt: "reply", action_prompt: "notify", debounce_seconds: -1 })).rejects.toThrow("debounce");
  await expect(module.setTrigger({ from_addresses: ["morgan@example.test"], gate_prompt: "reply", action_prompt: "notify", episode_id: "foreign" })).rejects.toThrow("episode");
  expect(applyBatch).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
