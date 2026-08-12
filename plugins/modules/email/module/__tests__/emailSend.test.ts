// Email send / reply / batch_send (@writeTool).
//
// Send flow (INV-5/6/27): validate the recipient, record a durable
// `email.send_attempt`, route to the provider, and only then persist the
// message carrying the provider's id. A refusal throws and stores nothing; a
// retry whose attempt is already `sent` performs no provider call.
//
// Reply still routes first and links attachments afterwards, so a post-send
// graph failure reports failure for mail that has already gone out. It is NOT
// yet on the attempt ledger — tracked as the remaining half of B25.
//
// Exercised through @magnis/testkit/module.

/**
 * @test-id: tst_module_email_delivery_001
 * @scenario: scn_backend_tests_006
 * @covers: EmailModule.emailSend, EmailModule.emailReply
 * @legacy-id: tst_module_email_attach_002_send_includes_attachments
 * @legacy-id: tst_module_email_attach_003_reply_accepts_attachments
 * @legacy-id: tst_module_email_attach_004_multitype_encoding
 * @legacy-id: tst_module_email_attach_005_no_attachments_regression
 * @legacy-id: tst_int_trig_040_email_send_without_a_connected_account_creates_nothing
 * @deterministic: yes
 */

import { describe, expect, it } from "vitest";
import type { EntityDetail, GraphBatchInput } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, type GraphOverrides, type MockGraph } from "@magnis/testkit/module";
import { EmailModule } from "../service.ts";
import { normalizeRecipient } from "../helpers.ts";
import type { EmailCanonical } from "../../types.ts";

type G = MockGraph;

function makeGraph(over: Partial<Record<string, unknown>> = {}): G {
  const overrides = {
    apply_batch: async (frag: GraphBatchInput) => ({
      ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
      created: frag.entities.length,
      updated: 0,
      links_added: frag.links?.length ?? 0,
      dropped_keys: [],
    }),
    add_link: () => Promise.resolve(undefined),
    // No prior send attempt unless a test arranges one.
    source_command: () => Promise.resolve({ message_id: "src-1" }),
    get_entity_full: () => Promise.resolve(null),
    ...over,
  } as unknown as GraphOverrides;
  return mockGraph(overrides);
}

function makeModule(graph: G): EmailModule {
  return mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
}

// noUncheckedIndexedAccess: `spies` is Record<string, Mock>, so each lookup is
// `Mock | undefined`. Every op referenced below IS arranged by makeGraph, so a
// missing spy is a harness bug — surface it, never mask it.
function spy(graph: G, op: string) {
  const s = graph.spies[op];
  if (s === undefined) throw new Error(`email send test: spy '${op}' not arranged`);
  return s;
}

describe("email send (tst_be_emailsend_001 / srcfail_002)", () => {
  it("creates the outgoing message + recipient address + sent_to link, then routes", async () => {
    const graph = makeGraph();
    const mod = makeModule(graph);
    const r = await mod.emailSend({ to: "Bob@Example.com", subject: "Hi", body_text: "hello" });
    // row, the message itself, then the ledger's `sent` row. Two extra writes
    // is the price of being able to answer "did this already leave?" — Gmail
    // has no idempotency key, so the alternative is re-sending real mail.
    expect(spy(graph, "apply_batch")).toHaveBeenCalledTimes(1);
    const applyCall0 = spy(graph, "apply_batch").mock.calls.find(
      (c) => (c[0] as GraphBatchInput).entities.some((e) => e.schema_id === "email.message"),
    );
    if (applyCall0 === undefined) throw new Error("send: apply_batch not called");
    const frag = applyCall0[0] as GraphBatchInput;
    const msg = frag.entities.find((e) => e.schema_id === "email.message")!;
    const addr = frag.entities.find((e) => e.schema_id === "email.address")!;
    expect(addr.idx).toBe("bob@example.com"); // lowercased recipient
    // S5: nodes are dictionaries under their anchors.
    expect(addr.anchor).toBe("email:address:bob@example.com");
    expect(addr.properties?.address).toBe("bob@example.com");
    expect(msg.properties?.is_outgoing).toBe(true);
    expect(frag.links).toEqual([{ from_key: "out", to_key: "addr:bob@example.com", kind: "sent_to" }]);

    // INV-5: the provider is called BEFORE the message is persisted, so a
    // refusal cannot leave a record of a send that never happened.
    expect(spy(graph, "source_command")).toHaveBeenCalledTimes(1);
    // INV-6: the provider's id rides on the stored message so a later ingest
    // of that same mail matches it instead of creating a duplicate.
    expect(msg.properties?.provider_message_id).toBe("src-1");
    expect(r.id).toBe("id-out");
    expect(r.schema_id).toBe("email.message");
    expect(r.attachment_count).toBe(0);
  });

  // INV-5. This test asserted the OPPOSITE until Stage 4b-ii: that a provider
  // failure was non-fatal and the entity persisted anyway. That behaviour IS
  // the demo defect — the tool reported a send Gmail never made.
  it("a provider failure is FATAL and persists no message", async () => {
    const graph = makeGraph({
      source_command: () => Promise.reject(new Error("no connected account")),
    });
    const mod = makeModule(graph);

    await expect(mod.emailSend({ to: "b@x.com", subject: "S", body_text: "B" })).rejects.toThrow(
      "no connected account",
    );

    // The only apply_batch calls are the send-attempt ledger (routing, then
    // failed) — never an email.message.
    const batched = spy(graph, "apply_batch").mock.calls.flatMap(
      (c) => (c[0] as GraphBatchInput).entities,
    );
    expect(batched.every((e) => e.schema_id === "email.send_attempt")).toBe(true);
  });

  /**
   * @test-id: tst_module_email_send_006
   * @invariant INV-27 — once the provider has accepted, the mail is gone and
   * cannot be recalled. Throwing here would report a failed send and invite a
   * retry that delivers the message a SECOND time. The graph write is an
   * optimistic view: Gmail's Sent folder is ingested with no label filter, so
   * the next sync creates the message anyway.
   */
  it("a graph write that fails AFTER the provider accepted does not fail the send", async () => {
    const graph = makeGraph({
      apply_batch: () => Promise.reject(new Error("graph unavailable")),
    });
    const mod = makeModule(graph);

    const r = await mod.emailSend({ to: "b@x.com", subject: "S", body_text: "B" });

    expect(r.graph_write_failed).toBe(true);
    expect(r.provider_message_id).toBe("src-1");
    expect(r.id).toBeNull();
    // Exactly one delivery — nothing invites a second attempt.
    expect(spy(graph, "source_command")).toHaveBeenCalledTimes(1);
  });

  /**
   * @test-id: tst_module_email_send_005
   * @invariant INV-6 — ingest matches on the record `external_id` and nothing
   * else, and Gmail hands back the same id for our own sent mail. Carrying it
   * on the outgoing message is what stops the copy arriving from Sent becoming
   * a SECOND entity.
   */
  it("stamps the provider ids so the copy arriving from Sent updates this entity", async () => {
    const graph = makeGraph({
      source_command: () => Promise.resolve({ message_id: "gmail-42", thread_id: "thr-9" }),
    });
    const mod = makeModule(graph);

    await mod.emailSend({ to: "b@x.com", subject: "S", body_text: "B" });

    const frag = spy(graph, "apply_batch").mock.calls[0]?.[0] as GraphBatchInput;
    const msg = frag.entities.find((e) => e.schema_id === "email.message")!;
    // S5: the provider id is the node ANCHOR — that is what makes the copy
    // arriving from Sent update this node instead of creating a second one.
    expect(msg.anchor).toBe("gmail-42");
    expect(msg.idx).toBe("thr-9");
  });

  it("links attachments and checks ownership", async () => {
    const graph = makeGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: { id: "f1", schema_id: "file.object", name: "doc.pdf", created_at: "" },
          links: [],
        } satisfies EntityDetail),
    });
    const mod = makeModule(graph);
    const r = await mod.emailSend({ to: "b@x.com", subject: "S", body_text: "B", attachment_ids: ["f1"] });
    expect(spy(graph, "add_link")).toHaveBeenCalledWith({ from_id: "id-out", to_id: "f1", kind: "file.attachment" });
    expect(r.attachment_count).toBe(1);
  });

  it("rejects an unowned attachment", async () => {
    const graph = makeGraph({ get_entity_full: () => Promise.resolve(null) });
    const mod = makeModule(graph);
    await expect(
      mod.emailSend({ to: "b@x.com", subject: "S", body_text: "B", attachment_ids: ["f-other"] }),
    ).rejects.toThrow(/not found/);
  });

  it("rejects an owned NON-file entity (no file.details — native strictness, no fallback)", async () => {
    const graph = makeGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: { id: "c1", schema_id: "company", name: "Acme", created_at: "" },
          links: [],
        } satisfies EntityDetail),
    });
    const mod = makeModule(graph);
    await expect(
      mod.emailSend({ to: "b@x.com", subject: "S", body_text: "B", attachment_ids: ["c1"] }),
    ).rejects.toThrow(/not found/);
    expect(spy(graph, "add_link")).not.toHaveBeenCalled();
  });
});

describe("email reply (tst_be_emailreply_003)", () => {
  // S5: the original's DICT is what the reply reads.
  const original = (): EntityDetail => ({
    entity: {
      id: "orig",
      schema_id: "email.message",
      name: "Quarterly",
      created_at: "",
      properties: {
        from_address: "boss@corp.com",
        subject: "Quarterly",
        message_id: "gmail-orig-1",
      },
    } as EntityDetail["entity"],
    links: [],
  });

  it("threads in_reply_to from the original and links attachments to the ORIGINAL", async () => {
    const graph = makeGraph({
      get_entity_full: (() => {
        let call = 0;
        return () => {
          call += 1;
          if (call === 1) return Promise.resolve(original()); // reply reads the original
          return Promise.resolve({
            entity: { id: "f1", schema_id: "file.object", name: "a", created_at: "" },
            links: [],
          } satisfies EntityDetail);
        };
      })(),
    });
    const mod = makeModule(graph);
    const r = await mod.emailReply({ email_id: "orig", body_text: "thanks", attachment_ids: ["f1"] });

    const srcCall0 = spy(graph, "source_command").mock.calls[0];
    if (srcCall0 === undefined) throw new Error("reply: source_command not called");
    const draft = srcCall0[0] as Record<string, unknown>;
    const d = draft.draft as Record<string, unknown>;
    expect(d.in_reply_to).toBe("gmail-orig-1");
    expect(d.subject).toBe("Re: Quarterly");
    expect(d.to).toEqual([{ address: "boss@corp.com" }]);
    // attachment linked to the ORIGINAL email, not a new entity
    expect(spy(graph, "add_link")).toHaveBeenCalledWith({ from_id: "orig", to_id: "f1", kind: "file.attachment" });
    expect(r.reply_to).toBe("boss@corp.com");
    expect(spy(graph, "apply_batch")).not.toHaveBeenCalled(); // reply creates no new message entity
  });

  it("rejects an unowned attachment (reply path) BEFORE routing", async () => {
    const graph = makeGraph({
      get_entity_full: (() => {
        let call = 0;
        return () => {
          call += 1;
          if (call === 1) return Promise.resolve(original()); // original resolves (owned)
          return Promise.resolve(null); // attachment not owned
        };
      })(),
    });
    const mod = makeModule(graph);
    await expect(
      mod.emailReply({ email_id: "orig", body_text: "thanks", attachment_ids: ["f-other"] }),
    ).rejects.toThrow(/not found/);
    expect(spy(graph, "source_command")).not.toHaveBeenCalled(); // rejected before send
    expect(spy(graph, "add_link")).not.toHaveBeenCalled();
  });

  /**
   * @test-id: tst_module_email_reply_004
   * @scenario: scn_demo_send_failure_003
   * @invariant INV-5 — reply obeys the same receipt rule as send. It reported
   * `status: "sent"` for whatever the connector returned, and wrote attachment
   * links to the ORIGINAL email while doing so — so a reply that never left
   * still mutated the graph.
   */
  it("tst_module_email_reply_004 a source success without a provider id is not a reply", async () => {
    const graph = makeGraph({
      get_entity_full: (() => {
        let call = 0;
        return () => {
          call += 1;
          if (call === 1) return Promise.resolve(original());
          return Promise.resolve({
            entity: { id: "f1", schema_id: "file.object", name: "a", created_at: "" },
            links: [],
          } satisfies EntityDetail);
        };
      })(),
      source_command: () => Promise.resolve({ thread_id: "thr-1" }), // no message_id
    });
    const mod = makeModule(graph);

    await expect(
      mod.emailReply({ email_id: "orig", body_text: "thanks", attachment_ids: ["f1"] }),
    ).rejects.toThrow(/no provider id/);

    expect(spy(graph, "add_link")).not.toHaveBeenCalled();
  });

  it("source failure is FATAL for reply (native parity)", async () => {
    const graph = makeGraph({
      get_entity_full: () => Promise.resolve(original()),
      source_command: () => Promise.reject(new Error("send failed")),
    });
    const mod = makeModule(graph);
    await expect(mod.emailReply({ email_id: "orig", body_text: "x" })).rejects.toThrow(/send failed/);
  });
});

describe("email batch_send (tst_be_emailbatch_send_004)", () => {
  it("sends each message, skips excluded indices, reports counts", async () => {
    const graph = makeGraph();
    const mod = makeModule(graph);
    const r = await mod.emailBatchSend({
      messages: [
        { to: "a@x.com", subject: "A", body_text: "1" },
        { to: "b@x.com", subject: "B", body_text: "2" },
        { to: "c@x.com", subject: "C", body_text: "3" },
      ],
      excluded_indices: [1],
    });
    expect(r.total).toBe(3);
    expect(r.sent).toBe(2);
    expect(r.excluded).toBe(1);
    const results = r.results as Record<string, unknown>[];
    const result0 = results[0];
    const result1 = results[1];
    if (result0 === undefined) throw new Error("batch_send: missing result[0]");
    if (result1 === undefined) throw new Error("batch_send: missing result[1]");
    expect(result1.status).toBe("excluded");
    expect(result1.id).toBeNull();
    expect(result0.status).toBe("sent");
    expect(spy(graph, "apply_batch")).toHaveBeenCalledTimes(2); // only the 2 non-excluded
  });

  it("rejects an out-of-range batch size", async () => {
    const mod = makeModule(makeGraph());
    await expect(mod.emailBatchSend({ messages: [] })).rejects.toThrow(/1\.\.=50/);
  });

  it("rejects a message missing a required field", async () => {
    const mod = makeModule(makeGraph());
    await expect(
      mod.emailBatchSend({ messages: [{ to: "a@x.com", subject: "", body_text: "x" } as never] }),
    ).rejects.toThrow(/missing subject/);
  });
});

/**
 * @test-id: tst_module_email_send_002
 * @scenario: scn_demo_send_failure_003
 * @covers: plugins/modules/email/module/helpers.ts::normalizeRecipient
 * @deterministic: yes
 * @fixtures: inline addresses
 *
 * @invariant INV-7 — a recipient that is not one valid address is rejected
 * before anything is written or routed. The demo sent
 * '["Mikhail.trash2@gmail.com"]' — the JSON text of an array — Gmail refused
 * it, and the refusal was swallowed.
 */
describe("email recipients are validated in the handler, not just declared", () => {
  it("tst_module_email_send_002 accepts one bare address and lower-cases it", () => {
    expect(normalizeRecipient("Omar@Decurity.io")).toBe("omar@decurity.io");
    expect(normalizeRecipient("  a@b.co  ")).toBe("a@b.co");
  });

  it("tst_module_email_send_002 rejects the JSON text of an array", () => {
    expect(() => normalizeRecipient('["Mikhail.trash2@gmail.com"]')).toThrow(/single valid address/);
  });

  it("tst_module_email_send_002 rejects lists, display names and empties", () => {
    expect(() => normalizeRecipient("a@b.co, c@d.co")).toThrow(/single valid address/);
    expect(() => normalizeRecipient("Omar <omar@x.io>")).toThrow(/single valid address/);
    expect(() => normalizeRecipient("not-an-address")).toThrow(/single valid address/);
    expect(() => normalizeRecipient("   ")).toThrow(/required/);
  });
});

/**
 * @test-id: tst_module_email_send_003
 * @scenario: scn_demo_send_failure_003
 * @covers: plugins/modules/email/module/service.ts::EmailModule.emailBatchSend
 * @deterministic: yes
 *
 * @invariant INV-7 — a malformed recipient anywhere in a batch stops the whole
 * batch BEFORE anything is routed. Validating lazily would leave the earlier
 * messages already delivered, and an outgoing mail cannot be recalled.
 */
describe("batch_send validates every recipient before sending any", () => {
  it("tst_module_email_send_003 a bad address in message 2 sends nothing at all", async () => {
    const graph = makeGraph();
    const { module: mod } = mountModule(EmailModule, { graph });

    await expect(
      mod.emailBatchSend({
        messages: [
          { to: "good@x.io", subject: "s", body_text: "b" },
          { to: '["bad@x.io"]', subject: "s", body_text: "b" },
        ],
      }),
    ).rejects.toThrow(/message\[1\][\s\S]*single valid address/);

    expect(graph.spies.source_command).not.toHaveBeenCalled();
    expect(graph.spies.apply_batch).not.toHaveBeenCalled();
  });
});

/**
 * @test-id: tst_module_email_send_007
 * @invariant INV-8 — messages already delivered cannot be recalled, so a later
 * refusal must not discard their results. Making send fatal (INV-5) turned the
 * loop into an all-or-nothing abort; this pins that it does not.
 */
describe("batch_send reports every message even when one is refused", () => {
  it("keeps the results of messages already delivered", async () => {
    let call = 0;
    const graph = makeGraph({
      source_command: () => {
        call++;
        return call === 2
          ? Promise.reject(new Error("no connected account"))
          : Promise.resolve({ message_id: `src-${String(call)}` });
      },
    });
    const mod = makeModule(graph);

    const r = (await mod.emailBatchSend({
      messages: [
        { to: "a@x.io", subject: "1", body_text: "b" },
        { to: "b@x.io", subject: "2", body_text: "b" },
        { to: "c@x.io", subject: "3", body_text: "b" },
      ],
    })) as { sent: number; failed: number; results: { status: string }[] };

    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.results.map((x) => x.status)).toEqual(["sent", "failed", "sent"]);
  });
});

/**
 * @test-id: tst_module_email_send_008
 * @scenario: scn_demo_send_failure_003
 * @invariant INV-5 — proof of delivery, not just absence of an error. Caught
 * live: the connector returned success with no message_id, the plugin wrote the
 * message, and the operator saw "sent" for mail Gmail never received. The
 * provider id IS the receipt.
 */
describe("a source success without a provider id is not a send", () => {
  it("tst_module_email_send_008 rejects and persists nothing", async () => {
    const graph = makeGraph({
      source_command: () => Promise.resolve({ thread_id: "thr-1" }), // no message_id
    });
    const mod = makeModule(graph);

    await expect(
      mod.emailSend({ to: "b@x.com", subject: "S", body_text: "B" }),
    ).rejects.toThrow(/no provider id/);

    expect(spy(graph, "apply_batch")).not.toHaveBeenCalled();
  });
});
