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

import { describe, expect, it } from "vitest";
import type { EntityDetail, GraphBatchInput } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, type GraphOverrides, type MockGraph } from "@magnis/testkit/module";
import { EmailModule } from "../service.ts";
import { normalizeRecipient } from "../helpers.ts";
import type { EmailCanonical, EmailFacets } from "../../types.ts";

type G = MockGraph<EmailFacets, EmailCanonical>;

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
    find_by_external_id: () => Promise.resolve(null),
    source_command: () => Promise.resolve({ message_id: "src-1" }),
    get_entity_full: () => Promise.resolve(null),
    ...over,
  } as unknown as GraphOverrides<EmailFacets, EmailCanonical>;
  return mockGraph<EmailFacets, EmailCanonical>(overrides);
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
    expect(spy(graph, "apply_batch")).toHaveBeenCalledTimes(3);
    const applyCall0 = spy(graph, "apply_batch").mock.calls.find(
      (c) => (c[0] as GraphBatchInput).entities.some((e) => e.schema_id === "email.message"),
    );
    if (applyCall0 === undefined) throw new Error("send: apply_batch not called");
    const frag = applyCall0[0] as GraphBatchInput;
    const msg = frag.entities.find((e) => e.schema_id === "email.message")!;
    const addr = frag.entities.find((e) => e.schema_id === "email.address")!;
    expect(addr.idx).toBe("bob@example.com"); // lowercased recipient
    const addrFacet0 = addr.facets[0];
    if (addrFacet0 === undefined) throw new Error("send: missing addr facet[0]");
    expect(addrFacet0.external_id).toBe("email:address:bob@example.com");
    const msgFacet0 = msg.facets[0];
    if (msgFacet0 === undefined) throw new Error("send: missing msg facet[0]");
    expect((msgFacet0.data as Record<string, unknown>).is_outgoing).toBe(true);
    expect(frag.links).toEqual([{ from_key: "out", to_key: "addr:bob@example.com", kind: "sent_to" }]);

    // INV-5: the provider is called BEFORE the message is persisted, so a
    // refusal cannot leave a record of a send that never happened.
    expect(spy(graph, "source_command")).toHaveBeenCalledTimes(1);
    // INV-6: the provider's id rides on the stored message so a later ingest
    // of that same mail matches it instead of creating a duplicate.
    expect((msgFacet0.data as Record<string, unknown>).provider_message_id).toBe("src-1");
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

  // INV-27 — the half of DEC-5 that route-first alone does not give you.
  it("does not re-send when a prior attempt already succeeded", async () => {
    const graph = makeGraph({
      find_by_external_id: () => Promise.resolve("attempt-1"),
      get_entity_full: () =>
        Promise.resolve({
          entity: { id: "attempt-1", schema_id: "email.send_attempt", name: "S", created_at: "" },
          facets: [{
            id: "a", schema_id: "email.send_attempt.details", source: "s", observed_at: "",
            data: { status: "sent", provider_message_id: "src-1", message_entity_id: "id-out" },
          }],
          links: [],
        }),
    });
    const mod = makeModule(graph);

    const r = await mod.emailSend({ to: "b@x.com", subject: "S", body_text: "B" });

    expect(spy(graph, "source_command")).not.toHaveBeenCalled();
    expect(r.id).toBe("id-out");
    expect(r.already_sent).toBe(true);
  });

  it("links attachments and checks ownership", async () => {
    const graph = makeGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: { id: "f1", schema_id: "file.object", name: "doc.pdf", created_at: "" },
          facets: [{ id: "x", schema_id: "file.details", source: "s", observed_at: "", data: { name: "doc.pdf" } }],
          links: [],
        } satisfies EntityDetail),
    });
    const mod = makeModule(graph);
    const r = await mod.emailSend({ to: "b@x.com", subject: "S", body_text: "B", attachment_ids: ["f1"] });
    expect(spy(graph, "add_link")).toHaveBeenCalledWith({ from_id: "id-out", to_id: "f1", kind: "attachment" });
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
          facets: [{ id: "x", schema_id: "company.details", source: "s", observed_at: "", data: {} }],
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
  const original = (): EntityDetail => ({
    entity: { id: "orig", schema_id: "email.message", name: "Quarterly", created_at: "" },
    facets: [
      {
        id: "f",
        schema_id: "email.message.details",
        source: "gmail",
        observed_at: "",
        data: { from_address: "boss@corp.com", subject: "Quarterly", message_id: "gmail-orig-1" },
      },
    ],
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
            facets: [{ id: "fd", schema_id: "file.details", source: "s", observed_at: "", data: { name: "a" } }],
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
    expect(spy(graph, "add_link")).toHaveBeenCalledWith({ from_id: "orig", to_id: "f1", kind: "attachment" });
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
    // 2 sends x 3 writes each (routing, message, sent) — see the note above.
    expect(spy(graph, "apply_batch")).toHaveBeenCalledTimes(6); // only the 2 non-excluded
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
