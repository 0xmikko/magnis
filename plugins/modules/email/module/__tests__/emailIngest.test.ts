// Stage 3 — email ingest (@syncHandler): apply_batch parity + DB-access
// guarantees. Unit-tests the module with a mock GraphService whose ops are
// vi.fn() spies. Asserts the fragment shape (entities/links/addresses folded
// in), idempotency seams (external_ids), live trigger.check parity, delete,
// empty-user skip, and the op-count gate INV-DB-3.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BatchEntityInput,
  BatchLinkInput,
  GraphBatchInput,
  GraphBatchResult,
  GraphService,
  PluginDeps,
} from "@magnis/plugin-sdk";
import { EmailModule } from "../service.ts";
import type { EmailCanonical, EmailFacets, SyncEnvelope } from "../../types/index.ts";

function makeGraph(): GraphService<EmailFacets, EmailCanonical> {
  const reject =
    (name: string) =>
    (..._a: unknown[]): never => {
      throw new Error(`unexpected graph op on ingest path: ${name}`);
    };
  return {
    // apply_batch echoes each key → a deterministic id so post-apply can resolve.
    apply_batch: vi.fn<[GraphBatchInput], Promise<GraphBatchResult>>(async (frag) => ({
      ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
      created: frag.entities.length,
      updated: 0,
      links_added: frag.links?.length ?? 0,
      dropped_keys: [],
    })),
    file_register: vi.fn<[unknown], Promise<string>>().mockResolvedValue("file-id"),
    find_by_external_id: vi.fn<[string], Promise<string | null>>().mockResolvedValue("existing-id"),
    delete_entity: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
    create_entity: vi.fn(reject("create_entity")),
    attach_facet: vi.fn(reject("attach_facet")),
    add_link: vi.fn(reject("add_link")),
  } as unknown as GraphService<EmailFacets, EmailCanonical>;
}

function makeModule(graph: GraphService<EmailFacets, EmailCanonical>): EmailModule {
  return new EmailModule({
    graph,
    ctx: { extension_id: "email", user_id: "u1" },
    util: {},
    rpc: { call: vi.fn() },
  } as unknown as PluginDeps<EmailFacets, EmailCanonical>);
}

const env = (over: Partial<SyncEnvelope> & { payload?: Record<string, unknown> }): SyncEnvelope => ({
  source_id: "google",
  surface: "email",
  account_id: "acct-1",
  user_id: "u1",
  kind: "snapshot",
  remote_id: "m1",
  payload: {},
  timestamp: "2026-03-14T09:00:00Z",
  ...over,
});

const msgPayload = (over: Record<string, unknown> = {}) => ({
  message_id: "mail-1",
  subject: "Report Q3",
  from_address: "CEO@example.com",
  from_name: "CEO",
  to_addresses: "me@example.com, ops@example.com",
  snippet: "Q3 results",
  body_text: "see attached",
  sent_at: "2026-03-14T09:00:00Z",
  thread_id: "thread-1",
  ...over,
});

describe("email ingest — apply_batch shape (tst_be_emailingest_001)", () => {
  let graph: GraphService<EmailFacets, EmailCanonical>;
  let mod: EmailModule;
  beforeEach(() => {
    graph = makeGraph();
    mod = makeModule(graph);
  });

  it("folds messages + unique addresses + sent_from/sent_to links into one batch", async () => {
    await mod.ingest({
      envelopes: [
        env({ remote_id: "m1", payload: msgPayload() }),
        env({ remote_id: "m2", payload: msgPayload({ message_id: "mail-2", from_address: "ceo@example.com", to_addresses: "me@example.com" }) }),
      ],
    });

    expect(graph.apply_batch).toHaveBeenCalledTimes(1);
    const frag = (graph.apply_batch as ReturnType<typeof vi.fn>).mock.calls[0][0] as GraphBatchInput;

    const msgs = frag.entities.filter((e: BatchEntityInput) => e.schema_id === "email.message");
    const addrs = frag.entities.filter((e: BatchEntityInput) => e.schema_id === "email.address");
    expect(msgs.map((m) => m.key).sort()).toEqual(["m1", "m2"]);
    // unique, lowercased addresses: ceo@, me@, ops@ (m1+m2 share ceo@ and me@)
    expect(addrs.map((a) => a.idx).sort()).toEqual(["ceo@example.com", "me@example.com", "ops@example.com"]);

    // message entity: name=subject, idx=thread_id, date=sent_at, facet external_id=remote_id
    const m1 = msgs.find((m) => m.key === "m1")!;
    expect(m1.name).toBe("Report Q3");
    expect(m1.idx).toBe("thread-1");
    expect(m1.date).toBe("2026-03-14T09:00:00Z");
    expect(m1.facets[0].schema_id).toBe("email.message.details");
    expect(m1.facets[0].external_id).toBe("m1");

    // address entity carries a stable external_id (idempotent resolve-or-create)
    const ceo = addrs.find((a) => a.idx === "ceo@example.com")!;
    expect(ceo.facets[0].external_id).toBe("email:address:ceo@example.com");
    expect((ceo.facets[0].data as Record<string, unknown>).address).toBe("ceo@example.com");

    // links: sent_from (msg→sender) + sent_to (msg→each recipient)
    const links = frag.links ?? [];
    const m1from = links.filter((l: BatchLinkInput) => l.from_key === "m1" && l.kind === "sent_from");
    const m1to = links.filter((l: BatchLinkInput) => l.from_key === "m1" && l.kind === "sent_to");
    expect(m1from).toHaveLength(1);
    expect(m1from[0].to_key).toBe("addr:ceo@example.com");
    expect(m1to.map((l) => l.to_key).sort()).toEqual(["addr:me@example.com", "addr:ops@example.com"]);
  });

  it("folds Cc + Bcc recipients into address entities + sent_to links", async () => {
    await mod.ingest({
      envelopes: [
        env({
          remote_id: "m1",
          payload: msgPayload({
            to_addresses: "to@x.com",
            cc_addresses: "Cc1@x.com, cc2@x.com",
            bcc_addresses: "bcc@x.com",
          }),
        }),
      ],
    });
    const frag = (graph.apply_batch as ReturnType<typeof vi.fn>).mock.calls[0][0] as GraphBatchInput;
    const addrIdx = frag.entities
      .filter((e: BatchEntityInput) => e.schema_id === "email.address")
      .map((e) => e.idx)
      .sort();
    // sender + to + cc(×2, lowercased) + bcc — all folded as address entities
    expect(addrIdx).toEqual(["bcc@x.com", "cc1@x.com", "cc2@x.com", "ceo@example.com", "to@x.com"]);
    const sentTo = (frag.links ?? [])
      .filter((l: BatchLinkInput) => l.kind === "sent_to")
      .map((l) => l.to_key)
      .sort();
    expect(sentTo).toEqual(["addr:bcc@x.com", "addr:cc1@x.com", "addr:cc2@x.com", "addr:to@x.com"]);
  });

  it("LIVE trigger touched_entity_ids includes Cc/Bcc recipients", async () => {
    const triggers = (
      await mod.ingest({
        envelopes: [
          env({
            kind: "live",
            remote_id: "m1",
            payload: msgPayload({ to_addresses: "to@x.com", cc_addresses: "cc@x.com", bcc_addresses: "bcc@x.com" }),
          }),
        ],
      })
    ).trigger_checks;
    expect(triggers).toHaveLength(1);
    expect(triggers[0].touched_entity_ids).toEqual(
      expect.arrayContaining(["id-addr:cc@x.com", "id-addr:bcc@x.com", "id-addr:to@x.com"]),
    );
  });

  it("registers each attachment via file_register with native-parity ids", async () => {
    await mod.ingest({
      envelopes: [
        env({
          remote_id: "m1",
          payload: msgPayload({
            attachments: [
              { attachment_id: "att-1", filename: "photo.jpg", mime_type: "image/jpeg", size: 150000 },
            ],
          }),
        }),
      ],
    });
    expect(graph.file_register).toHaveBeenCalledTimes(1);
    const call = (graph.file_register as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(call.external_id).toBe("file:gmail:acct-1:m1:att-1");
    expect(call.parent_external_id).toBe("m1");
    expect(call.link_kind).toBe("attachment");
    expect(call.name).toBe("photo.jpg");
    expect(call.mime_type).toBe("image/jpeg");
    expect(call.source_module).toBe("google");
    expect(call.source_surface).toBe("email");
  });

  // tst_fe_email_media_source_routing_001: source_module must be the ENVELOPE's
  // source_id — the host file worker routes download_file by (source_module,
  // source_surface). A hardcoded "google" breaks attachment downloads when the
  // email surface is served by a differently-named connector (google-ts).
  it("stamps the envelope's source_id as source_module (google-ts connector)", async () => {
    await mod.ingest({
      envelopes: [
        env({
          source_id: "google-ts",
          remote_id: "m1",
          payload: msgPayload({
            attachments: [
              { attachment_id: "att-1", filename: "photo.jpg", mime_type: "image/jpeg", size: 150000 },
            ],
          }),
        }),
      ],
    });
    const call = (graph.file_register as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(call.source_module).toBe("google-ts");
    expect(call.source_surface).toBe("email");
  });
});

describe("email ingest — trigger / delete / empty-user parity", () => {
  let graph: GraphService<EmailFacets, EmailCanonical>;
  let mod: EmailModule;
  beforeEach(() => {
    graph = makeGraph();
    mod = makeModule(graph);
  });

  it("LIVE → one trigger.check (touched = message + recipients + sender); SNAPSHOT → none", async () => {
    const live = await mod.ingest({ envelopes: [env({ kind: "live", remote_id: "m1", payload: msgPayload() })] });
    expect(live.trigger_checks).toHaveLength(1);
    const tc = live.trigger_checks[0];
    expect(tc.event_kind).toBe("new_email");
    expect(tc.entity_id).toBe("id-m1");
    expect(tc.context.from_address).toBe("CEO@example.com");
    // touched: message id + recipient address ids + sender address id
    expect(tc.touched_entity_ids).toEqual(
      expect.arrayContaining([
        "id-m1",
        "id-addr:me@example.com",
        "id-addr:ops@example.com",
        "id-addr:ceo@example.com",
      ]),
    );

    const snap = await mod.ingest({ envelopes: [env({ kind: "snapshot", remote_id: "m2", payload: msgPayload() })] });
    expect(snap.trigger_checks).toHaveLength(0);
  });

  it("DELETE → find_by_external_id + delete_entity, no apply_batch", async () => {
    await mod.ingest({ envelopes: [env({ kind: "delete", remote_id: "m-del", payload: {} })] });
    expect(graph.find_by_external_id).toHaveBeenCalledTimes(1);
    expect(graph.delete_entity).toHaveBeenCalledWith("existing-id");
    expect(graph.apply_batch).toHaveBeenCalledTimes(0);
  });

  it("empty user_id → skipped (no batch, no entity)", async () => {
    const r = await mod.ingest({ envelopes: [env({ user_id: "", remote_id: "m1", payload: msgPayload() })] });
    expect(graph.apply_batch).toHaveBeenCalledTimes(0);
    expect(r.trigger_checks).toHaveLength(0);
  });
});

describe("email ingest — DB-access guarantees (tst_be_emaildb_005 / INV-DB-3)", () => {
  let graph: GraphService<EmailFacets, EmailCanonical>;
  let mod: EmailModule;
  beforeEach(() => {
    graph = makeGraph();
    mod = makeModule(graph);
  });

  it("small page (msgs+addresses < 200) = exactly 1 apply_batch, 0 per-item crossings", async () => {
    await mod.ingest({
      envelopes: [
        env({ remote_id: "m1", payload: msgPayload() }),
        env({ remote_id: "m2", payload: msgPayload({ message_id: "mail-2" }) }),
        env({ remote_id: "m3", payload: msgPayload({ message_id: "mail-3" }) }),
      ],
    });
    expect(graph.apply_batch).toHaveBeenCalledTimes(1);
    expect(graph.create_entity).toHaveBeenCalledTimes(0);
    expect(graph.add_link).toHaveBeenCalledTimes(0);
    expect(graph.attach_facet).toHaveBeenCalledTimes(0);
    expect(graph.find_by_external_id).toHaveBeenCalledTimes(0); // delete-only
  });

  it("large page chunks by TOTAL entities — >1 apply_batch, each ≤200, all messages applied", async () => {
    // 100 messages, each with a unique sender + 2 unique recipients = 1 msg + 3
    // address entities = 4 entities/msg → 400 total → must split into ≥2 chunks,
    // none exceeding 200, and never split a single message.
    const envelopes = Array.from({ length: 100 }, (_, i) =>
      env({
        remote_id: `m${i}`,
        payload: msgPayload({
          message_id: `mail-${i}`,
          from_address: `s${i}@x.com`,
          to_addresses: `a${i}@x.com, b${i}@x.com`,
          cc_addresses: "",
          bcc_addresses: "",
        }),
      }),
    );
    await mod.ingest({ envelopes });

    const calls = (graph.apply_batch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(1); // chunked, not one giant batch
    const seenMsgKeys = new Set<string>();
    for (const [frag] of calls as [GraphBatchInput][]) {
      expect(frag.entities.length).toBeLessThanOrEqual(200); // cap holds per chunk
      for (const e of frag.entities) {
        if (e.schema_id === "email.message") seenMsgKeys.add(e.key);
      }
    }
    expect(seenMsgKeys.size).toBe(100); // every message applied exactly once across chunks
  });
});
