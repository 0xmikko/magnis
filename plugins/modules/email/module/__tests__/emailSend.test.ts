// Stage 4 — email send / reply / batch_send (@writeTool). Native-parity flow:
// create the outgoing message FIRST (apply_batch), then route best-effort
// (source failure non-fatal for send). Reply threads in_reply_to + links
// attachments to the ORIGINAL. Exercised through @magnis/testkit/module.

import { describe, expect, it } from "vitest";
import type { EntityDetail, GraphBatchInput } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, type GraphOverrides, type MockGraph } from "@magnis/testkit/module";
import { EmailModule } from "../service.ts";
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
    source_command: () => Promise.resolve({ message_id: "src-1" }),
    get_entity_full: () => Promise.resolve(null),
    ...over,
  } as unknown as GraphOverrides<EmailFacets, EmailCanonical>;
  return mockGraph<EmailFacets, EmailCanonical>(overrides);
}

function makeModule(graph: G): EmailModule {
  return mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
}

describe("email send (tst_be_emailsend_001 / srcfail_002)", () => {
  it("creates the outgoing message + recipient address + sent_to link, then routes", async () => {
    const graph = makeGraph();
    const mod = makeModule(graph);
    const r = await mod.emailSend({ to: "Bob@Example.com", subject: "Hi", body_text: "hello" });

    expect(graph.spies.apply_batch).toHaveBeenCalledTimes(1);
    const frag = graph.spies.apply_batch.mock.calls[0][0] as GraphBatchInput;
    const msg = frag.entities.find((e) => e.schema_id === "email.message")!;
    const addr = frag.entities.find((e) => e.schema_id === "email.address")!;
    expect(addr.idx).toBe("bob@example.com"); // lowercased recipient
    expect(addr.facets[0].external_id).toBe("email:address:bob@example.com");
    expect((msg.facets[0].data as Record<string, unknown>).is_outgoing).toBe(true);
    expect(frag.links).toEqual([{ from_key: "out", to_key: "addr:bob@example.com", kind: "sent_to" }]);

    // source routed AFTER the entity exists
    expect(graph.spies.source_command).toHaveBeenCalledTimes(1);
    expect(r.id).toBe("id-out");
    expect(r.schema_id).toBe("email.message");
    expect(r.attachment_count).toBe(0);
  });

  it("source failure is NON-FATAL — the entity still persists", async () => {
    const graph = makeGraph({
      source_command: () => Promise.reject(new Error("no connected account")),
    });
    const mod = makeModule(graph);
    const r = await mod.emailSend({ to: "b@x.com", subject: "S", body_text: "B" });
    expect(graph.spies.apply_batch).toHaveBeenCalledTimes(1); // created before the (failing) route
    expect(r.id).toBe("id-out");
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
    expect(graph.spies.add_link).toHaveBeenCalledWith({ from_id: "id-out", to_id: "f1", kind: "attachment" });
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
    expect(graph.spies.add_link).not.toHaveBeenCalled();
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

    const draft = graph.spies.source_command.mock.calls[0][0] as Record<string, unknown>;
    const d = draft.draft as Record<string, unknown>;
    expect(d.in_reply_to).toBe("gmail-orig-1");
    expect(d.subject).toBe("Re: Quarterly");
    expect(d.to).toEqual([{ address: "boss@corp.com" }]);
    // attachment linked to the ORIGINAL email, not a new entity
    expect(graph.spies.add_link).toHaveBeenCalledWith({ from_id: "orig", to_id: "f1", kind: "attachment" });
    expect(r.reply_to).toBe("boss@corp.com");
    expect(graph.spies.apply_batch).not.toHaveBeenCalled(); // reply creates no new message entity
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
    expect(graph.spies.source_command).not.toHaveBeenCalled(); // rejected before send
    expect(graph.spies.add_link).not.toHaveBeenCalled();
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
    expect(results[1].status).toBe("excluded");
    expect(results[1].id).toBeNull();
    expect(results[0].status).toBe("sent");
    expect(graph.spies.apply_batch).toHaveBeenCalledTimes(2); // only the 2 non-excluded
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
