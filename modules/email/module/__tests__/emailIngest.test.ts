// Email ingest (@syncHandler): apply_batch parity + DB-access
// guarantees. Exercised through @magnis/testkit/module. Asserts the fragment
// shape (entities/links/addresses folded in), idempotency seams (external_ids),
// live trigger.check parity, delete, empty-user skip, and the op-count gate.
//
// mockGraph is a throwing Proxy: the per-item write ops (create_entity/
// attach_facet/add_link) are NOT arranged, so any per-item crossing throws —
// that guarantee REPLACES the old reject() spies AND their toHaveBeenCalledTimes(0)
// assertions (an unarranged op has no spy to count).

/**
 * @test-id: tst_module_email_ingest_001
 * @scenario: scn_backend_tests_006
 * @covers: EmailModule.ingest
 * @legacy-id: tst_int_emailsync_003_email_snapshot_ingest_becomes_visible_via_rpc
 * @legacy-id: tst_int_emailsync_004_email_repeated_envelopes_converge_on_single_entity
 * @legacy-id: tst_int_emailsync_005_email_delete_envelope_removes_synced_entity
 * @legacy-id: tst_module_email_attach_001_ingest_creates_file_entities
 * @legacy-id: tst_int_trig_033_email_ingest_resolves_address_in_touched_ids
 * @deterministic: yes
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchEntityInput, BatchLinkInput, GraphBatchInput, RawSyncableEntity } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { EmailModule } from "../service.ts";
import { destSubpath } from "../helpers.ts";
import { message } from "../../entities.ts";
import type { EmailCanonical, SyncEnvelope } from "../../types.ts";

type G = MockGraph;

function ingestGraph(): G {
  const addressRows = new Map<string, RawSyncableEntity>();
  return mockGraph({
    moduleSettings: () => Promise.resolve({ newSenderSyncEnabled: "true" }),
    admitSyncEntities: (subjects) => Promise.resolve(subjects.flatMap((subject) => [...subject.remoteIds])),
    get_entities: (ids) => Promise.resolve(ids.map((id) => {
      const row = addressRows.get(id);
      if (row === undefined) throw new Error(`Missing address fixture ${id}`);
      return row;
    })),
    get_entity: (id) => Promise.resolve({ id, schema_id: "email.address", name: "ceo@example.com", properties: { address: "ceo@example.com" }, indexed: true, syncEnabled: true, syncRevision: "0" }),
    get_entity_full: (id) => Promise.resolve({ entity: { id, schema_id: "email.message", name: "Stored", indexed: true }, links: [{ id: `author-${id}`, from_id: id, to_id: "id-addr:ceo@example.com", kind: "authored_by", validUntil: null }] }),
    // apply_batch echoes each key → a deterministic id so post-apply can resolve.
    apply_batch: (frag) =>
      Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
        created: frag.entities.length,
        updated: 0,
        links_added: frag.links?.length ?? 0,
        dropped_keys: [],
      }),
    file_register: () => Promise.resolve("file-id"),
    find_by_anchor: () => Promise.resolve("existing-id"),
    find_by_anchors: (anchors) => Promise.resolve(anchors.map((anchor) => {
      if (!anchor.startsWith("email:address:")) return null;
      const address = anchor.slice("email:address:".length);
      const id = `id-addr:${address}`;
      addressRows.set(id, { id, schema_id: "email.address", name: address, properties: { address }, indexed: true, syncEnabled: true, syncRevision: "0" });
      return id;
    })),
    delete_entity: () => Promise.resolve(undefined),
  });
}

// noUncheckedIndexedAccess: `spies` is Record<string, Mock>, so each lookup is
// `Mock | undefined`. Every op referenced below IS arranged by ingestGraph, so a
// missing spy is a harness bug — surface it, never mask it.
function spy(graph: G, op: string) {
  const s = graph.spies[op];
  if (s === undefined) throw new Error(`email ingest test: spy '${op}' not arranged`);
  return s;
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

/**
 * @test-id: tst_module_email_sync_001
 * @scenario: scn_google_sync_001
 * @covers: EmailModule.ingest
 * @deterministic: yes
 * @fixtures: mixed accounts, stopped sender additions, id-only labels and deletions
 */
it("tst_module_email_sync_001 admits only enabled senders before content, attachment and trigger effects", async () => {
  const rows: RawSyncableEntity[] = [
    { id: "sender-a", schema_id: "email.address", name: "a@example.com", indexed: true, properties: { address: "a@example.com" }, syncEnabled: true, syncRevision: "1" },
    { id: "sender-b", schema_id: "email.address", name: "b@example.com", indexed: true, properties: { address: "b@example.com" }, syncEnabled: false, syncRevision: "2" },
  ];
  const batches: GraphBatchInput[] = [];
  const graph = mockGraph({
    find_by_anchors: (anchors) => Promise.resolve(anchors.map((anchor) => rows.find((row) => anchor === `email:address:${row.name}`)?.id ?? null)),
    find_by_anchor: (anchor) => Promise.resolve(anchor === "b-label" || anchor === "b-delete" ? `stored-${anchor}` : null),
    get_entities: (ids) => Promise.resolve(rows.filter((row) => ids.includes(row.id))),
    get_entity: (id) => Promise.resolve(rows.find((row) => row.id === id) ?? null),
    get_entity_full: (id) => Promise.resolve({
      entity: { id, schema_id: "email.message", name: "Stored", indexed: true, properties: { subject: "Stored" } },
      links: [{ id: `author-${id}`, from_id: id, to_id: "sender-b", kind: "authored_by", validUntil: null }],
    }),
    admitSyncEntities: (subjects) => Promise.resolve(subjects.flatMap((subject) => subject.entityId === "sender-a" ? [...subject.remoteIds] : [])),
    apply_batch: (batch) => {
      batches.push(batch);
      return Promise.resolve({ ids: Object.fromEntries([...batch.entities, ...(batch.refs ?? [])].map((item) => [item.key, `id-${item.key}`])), created: batch.entities.length, updated: 0, links_added: batch.links?.length ?? 0, dropped_keys: [] });
    },
    file_register: () => Promise.resolve("file-id"),
    delete_entity: () => Promise.resolve(),
  });
  const mod = mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
  const result = await mod.ingest({ envelopes: [
    env({ remote_id: "mailbox", payload: { entity_type: "mailbox", messages_total: 100, skipped: 0 } }),
    env({ remote_id: "a-new", kind: "live", payload: msgPayload({ from_address: " A@EXAMPLE.com ", to_addresses: "b@example.com" }) }),
    env({ remote_id: "b-new", account_id: "acct-2", kind: "live", payload: msgPayload({ from_address: "B@example.com", attachments: [{ attachment_id: "blocked-file" }] }) }),
    env({ remote_id: "b-label", payload: { labels: ["INBOX"] } }),
    env({ remote_id: "b-delete", account_id: "acct-2", kind: "delete" }),
  ] });
  expect(batches.flatMap((batch) => batch.entities.filter((item) => item.schema_id === "email.message").map((item) => item.key))).toEqual(["a-new"]);
  expect(batches.flatMap((batch) => batch.entities).some((item) => item.anchor === "email:address:b@example.com")).toBe(false);
  expect(graph.spies.delete_entity).not.toHaveBeenCalled();
  expect(graph.spies.file_register).not.toHaveBeenCalled();
  expect(result.trigger_checks.map((check) => check.entity_id)).toEqual(["id-a-new"]);
  expect(graph.spies.admitSyncEntities).toHaveBeenCalledExactlyOnceWith([
    { entityId: "sender-a", remoteIds: ["a-new"] },
    { entityId: "sender-b", remoteIds: ["b-new", "b-label", "b-delete"] },
  ], ["mailbox"]);
});

describe("email ingest — apply_batch shape (tst_be_emailingest_001)", () => {
  let graph: G;
  let mod: EmailModule;
  beforeEach(() => {
    graph = ingestGraph();
    mod = mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
  });

  /**
   * @test-id: tst_module_email_ingest_002
   * @scenario: scn_google_pull_001
   * @covers: EmailModule.ingest
   * @deterministic: yes
   * @fixtures: flattened Gmail message with provider id, Message-ID header, null thread
   */
  it("tst_module_email_ingest_002 stores a Gmail payload in the declared message schema", async () => {
    await mod.ingest({ envelopes: [env({ payload: msgPayload({
      id: "gmail-1", message_id: undefined, message_id_header: "<m1@example.com>", thread_id: null,
    }) })] });
    const batch = spy(graph, "apply_batch").mock.calls[0]?.[0] as GraphBatchInput | undefined;
    const stored = batch?.entities.find((entity) => entity.schema_id === "email.message");
    expect(message.safeParse(stored?.properties).success).toBe(true);
    expect(stored?.properties?.message_id).toBe("<m1@example.com>");
  });

  it("folds messages + unique addresses + sent_from/sent_to links into one batch", async () => {
    await mod.ingest({
      envelopes: [
        env({ remote_id: "m1", payload: msgPayload() }),
        env({ remote_id: "m2", payload: msgPayload({ message_id: "mail-2", from_address: "ceo@example.com", to_addresses: "me@example.com" }) }),
      ],
    });

    expect(spy(graph, "apply_batch")).toHaveBeenCalledTimes(1);
    const applyCall0 = spy(graph, "apply_batch").mock.calls[0];
    if (applyCall0 === undefined) throw new Error("ingest: apply_batch not called");
    const frag = applyCall0[0] as GraphBatchInput;

    const msgs = frag.entities.filter((e: BatchEntityInput) => e.schema_id === "email.message");
    const addrs = frag.entities.filter((e: BatchEntityInput) => e.schema_id === "email.address");
    expect(msgs.map((m) => m.key).sort()).toEqual(["m1", "m2"]);
    // unique, lowercased addresses: ceo@, me@, ops@ (m1+m2 share ceo@ and me@)
    expect(addrs.map((a) => a.idx).sort()).toEqual(["ceo@example.com", "me@example.com", "ops@example.com"]);

    // message entity: name=subject, idx=thread_id, date=sent_at, anchor=remote_id
    const m1 = msgs.find((m) => m.key === "m1")!;
    expect(m1.name).toBe("Report Q3");
    expect(m1.idx).toBe("thread-1");
    expect(m1.date).toBe("2026-03-14T09:00:00Z");
    // S5: the message node is its DICTIONARY under the remote_id anchor —
    // the details record retired, and the fields the edges now represent
    // (attachments, the joined recipient strings) left the dict.
    expect(m1.anchor).toBe("m1");
    expect(m1.properties?.subject).toBe("Report Q3");
    expect(m1.properties?.attachments).toBeUndefined();
    expect(m1.properties?.to_addresses).toBeUndefined();

    // address entity resolves by its chokepoint anchor (idempotent)
    const ceo = addrs.find((a) => a.idx === "ceo@example.com")!;
    expect(ceo.anchor).toBe("email:address:ceo@example.com");
    expect(ceo.properties?.address).toBe("ceo@example.com");

    // links: sent_from (msg→sender) + sent_to (msg→each recipient)
    const links = frag.links ?? [];
    const m1from = links.filter((l: BatchLinkInput) => l.from_key === "m1" && l.kind === "authored_by");
    const m1to = links.filter((l: BatchLinkInput) => l.from_key === "m1" && l.kind === "sent_to");
    expect(m1from).toHaveLength(1);
    const m1from0 = m1from[0];
    if (m1from0 === undefined) throw new Error("ingest: missing m1from[0] link");
    expect(m1from0.to_key).toBe("addr:ceo@example.com");
    expect(m1to.map((l) => l.to_key).sort()).toEqual(["addr:me@example.com", "addr:ops@example.com"]);
    // S5 review: the To/Cc/Bcc ROLE rides the edge dictionary — once the
    // joined strings leave the dict, the edge is the only place it survives.
    for (const l of m1to) {
      expect(l.metadata).toEqual({ role: "to" });
    }
  });

  it("a recipient listed under To AND Cc keeps the STRONGEST role", async () => {
    await mod.ingest({
      envelopes: [
        env({
          remote_id: "dup-1",
          payload: {
            subject: "Dup",
            from_address: "boss@corp.com",
            to_addresses: "ann@x.com",
            cc_addresses: "ann@x.com, ben@x.com",
          },
        }),
      ],
    });
    const call = spy(graph, "apply_batch").mock.calls[0] as [GraphBatchInput] | undefined;
    if (call === undefined) throw new Error("ingest: apply_batch never called");
    const sentTo = (call[0].links ?? []).filter((l) => l.kind === "sent_to");
    const ann = sentTo.find((l) => l.to_key === "addr:ann@x.com");
    const ben = sentTo.find((l) => l.to_key === "addr:ben@x.com");
    expect(ann?.metadata).toEqual({ role: "to" });
    expect(ben?.metadata).toEqual({ role: "cc" });
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
    const applyCall0 = spy(graph, "apply_batch").mock.calls[0];
    if (applyCall0 === undefined) throw new Error("ingest cc/bcc: apply_batch not called");
    const frag = applyCall0[0] as GraphBatchInput;
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

  // tst_be_emailingest_trigger_006 — INV-9. This test previously asserted the
  // OPPOSITE: that Cc/Bcc/To recipients were trigger candidates. That is the
  // defect. A trigger watches an address to hear FROM it; listing recipients
  // made the user's own address a candidate, so mail the user had just SENT
  // satisfied a trigger waiting for a reply.
  it("LIVE trigger candidates are the message and the SENDER only — never recipients", async () => {
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
    const trigger0 = triggers[0];
    if (trigger0 === undefined) throw new Error("ingest: missing trigger[0]");
    expect(trigger0.touched_entity_ids).not.toEqual(
      expect.arrayContaining(["id-addr:cc@x.com", "id-addr:bcc@x.com", "id-addr:to@x.com"]),
    );
    expect(trigger0.touched_entity_ids).toEqual(["id-m1", "id-addr:ceo@example.com"]);
  });

  // tst_be_emailingest_trigger_007 — INV-10. The engine needs the event's own
  // time to refuse history; without it a delayed backfill fired a trigger that
  // was created afterwards.
  it("LIVE trigger context carries the message's occurred_at", async () => {
    const triggers = (
      await mod.ingest({
        envelopes: [env({ kind: "live", remote_id: "m1", payload: msgPayload() })],
      })
    ).trigger_checks;
    const trigger0 = triggers[0];
    if (trigger0 === undefined) throw new Error("ingest: missing trigger[0]");
    expect(trigger0.context).toHaveProperty("occurred_at");
    expect(trigger0.context.occurred_at).toBeTruthy();
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
    expect(spy(graph, "file_register")).toHaveBeenCalledTimes(1);
    const fileCall0 = spy(graph, "file_register").mock.calls[0];
    if (fileCall0 === undefined) throw new Error("ingest: file_register not called");
    const call = fileCall0[0] as Record<string, unknown>;
    expect(call.external_id).toBe("file:gmail:acct-1:m1:att-1");
    expect(call.parent_external_id).toBe("m1");
    expect(call.link_kind).toBe("file.attachment");
    expect(call.name).toBe("photo.jpg");
    expect(call.mime_type).toBe("image/jpeg");
    expect(call.source_module).toBe("google");
    expect(call.source_surface).toBe("email");
  });

  /**
   * @test-id: tst_module_email_ingest_003
   * @scenario: scn_google_pull_004
   * @covers: EmailModule.ingest
   * @deterministic: yes
   * @fixtures: one historical message and one live message, each with an attachment
   */
  it("tst_module_email_ingest_003 defers historical attachment bytes but fetches new ones", async () => {
    const payload = msgPayload({ attachments: [{ attachment_id: "att-1", filename: "photo.jpg" }] });
    await mod.ingest({ envelopes: [env({ kind: "snapshot", payload })] });
    expect(spy(graph, "file_register").mock.calls[0]?.[0].download).toBe(false);
    await mod.ingest({ envelopes: [env({ kind: "live", remote_id: "m2", payload })] });
    expect(spy(graph, "file_register").mock.calls[1]?.[0].download).toBe(true);
  });

  /**
   * @test-id: tst_module_email_ingest_004
   * @scenario: scn_google_pull_004
   * @covers: modules/email/module/helpers.ts::destSubpath
   * @deterministic: yes
   * @fixtures: an opaque 400-character Gmail attachment ID
   */
  it("tst_module_email_ingest_004 keeps every attachment path segment within filesystem limits", () => {
    const path = destSubpath("acct", "message", "A".repeat(400), "photo.jpg");
    expect(path.split("/").every((segment) => segment.length <= 255)).toBe(true);
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
    const fileCall0 = spy(graph, "file_register").mock.calls[0];
    if (fileCall0 === undefined) throw new Error("ingest: file_register not called");
    const call = fileCall0[0] as Record<string, unknown>;
    expect(call.source_module).toBe("google-ts");
    expect(call.source_surface).toBe("email");
  });
});

describe("email ingest — trigger / delete / empty-user parity", () => {
  let graph: G;
  let mod: EmailModule;
  beforeEach(() => {
    graph = ingestGraph();
    mod = mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
  });

  it("LIVE → one trigger.check (touched = message + sender only); SNAPSHOT → none", async () => {
    const live = await mod.ingest({ envelopes: [env({ kind: "live", remote_id: "m1", payload: msgPayload() })] });
    expect(Object.keys(live).sort()).toEqual(["dropped_remote_ids", "trigger_checks"]);
    expect(live.trigger_checks).toHaveLength(1);
    const tc = live.trigger_checks[0];
    if (tc === undefined) throw new Error("ingest: missing live trigger_check[0]");
    expect(tc.event_kind).toBe("new_email");
    expect(tc.entity_id).toBe("id-m1");
    expect(tc.context.from_address).toBe("CEO@example.com");
    // INV-9: message id + the SENDER's address id. Recipients are deliberately
    // absent — including them made the user's own address a trigger candidate.
    expect(tc.touched_entity_ids).toEqual(["id-m1", "id-addr:ceo@example.com"]);
    expect(tc.touched_entity_ids).not.toContain("id-addr:me@example.com");

    const snap = await mod.ingest({ envelopes: [env({ kind: "snapshot", remote_id: "m2", payload: msgPayload() })] });
    expect(snap.trigger_checks).toHaveLength(0);
  });

  it("DELETE → find_by_anchor + delete_entity, no apply_batch", async () => {
    await mod.ingest({ envelopes: [env({ kind: "delete", remote_id: "m-del", payload: {} })] });
    expect(spy(graph, "find_by_anchor")).toHaveBeenCalledTimes(1);
    expect(spy(graph, "delete_entity")).toHaveBeenCalledWith("existing-id");
    expect(spy(graph, "apply_batch")).toHaveBeenCalledTimes(0);
  });

  it("empty user_id → skipped (no batch, no entity)", async () => {
    const r = await mod.ingest({ envelopes: [env({ user_id: "", remote_id: "m1", payload: msgPayload() })] });
    expect(spy(graph, "apply_batch")).toHaveBeenCalledTimes(0);
    expect(r.trigger_checks).toHaveLength(0);
  });
});

/**
 * @test-id: tst_module_email_plan_001
 * @scenario: scn_google_sync_001
 * @covers: EmailModule.ingest (plan)
 * @deterministic: yes
 * @fixtures: a mailbox envelope of 100 messages with 10 skipped; a history page with one new mail and one removal
 *
 * The module states the mailbox's count as the Source counted it: in full on
 * the mailbox envelope that opens a pass, one more per new mail and one less
 * per removal on a history page, and nothing outside a worker's pass.
 */
describe("email ingest — the plan from the pages", () => {
  let graph: G;
  let mod: EmailModule;
  beforeEach(() => {
    graph = ingestGraph();
    mod = mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
  });
  const mailbox = env({ remote_id: "mailbox", payload: { entity_type: "mailbox", messages_total: 100, skipped: 10 } });

  it("states the mailbox in full and never ingests it as a message", async () => {
    const r = await mod.ingest({ generation: "initial:r:1", envelopes: [mailbox, env({ remote_id: "m1", payload: msgPayload() })] });
    expect(r).toEqual({ dropped_remote_ids: [], trigger_checks: [], plan: { "email.message": { total: 100, skipped: 10 } } });
    const batch = spy(graph, "apply_batch").mock.calls[0]?.[0] as GraphBatchInput | undefined;
    expect(batch?.entities.map((item) => item.key)).not.toContain("mailbox");
    expect(batch?.entities.some((item) => item.key === "m1")).toBe(true);
  });

  it("moves the count by one per new mail and per removal on a history page", async () => {
    const r = await mod.ingest({ generation: "initial:r:1", envelopes: [
      env({ kind: "live", remote_id: "m-new", payload: msgPayload({ message_id: "m-new" }) }),
      env({ kind: "snapshot", remote_id: "m-relabelled", payload: msgPayload({ message_id: "m-relabelled" }) }),
      env({ kind: "delete", remote_id: "m-gone", payload: {} }),
      env({ kind: "delete", remote_id: "m-gone-too", payload: {} }),
    ] });
    expect(r.plan).toEqual({ "email.message": { total: -1, skipped: 0 } });
  });

  it("states nothing outside a worker's pass", async () => {
    const r = await mod.ingest({ envelopes: [mailbox, env({ kind: "live", remote_id: "m-new", payload: msgPayload() })] });
    expect(r).toEqual({ dropped_remote_ids: [], trigger_checks: expect.any(Array) as never });
    expect("plan" in r).toBe(false);
  });
});

/**
 * @test-id: tst_module_google_003
 * @scenario: scn_google_pull_004
 * @covers: modules/email/module/service.ts::ingest
 * @deterministic: yes
 * @fixtures: one existing and one new live message, one present and one missing deletion, then a replay
 */
it("tst_module_google_003 counts only newly admitted Gmail messages and actual removals", async () => {
  const graph = ingestGraph();
  const mod = mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
  const lookupAddresses = spy(graph, "find_by_anchors").getMockImplementation();
  if (lookupAddresses === undefined) throw new Error("Missing address lookup fixture");
  spy(graph, "find_by_anchors").mockImplementation((anchors: string[]) =>
    anchors.some((anchor) => anchor.startsWith("email:address:")) ? lookupAddresses(anchors) : Promise.resolve(anchors.map((anchor) => anchor === "m-existing" ? "id-existing" : null)));
  spy(graph, "find_by_anchor").mockImplementation((anchor: string) =>
    Promise.resolve(anchor === "m-gone" ? "id-gone" : null));

  const first = await mod.ingest({ generation: "forward:r:1", envelopes: [
    env({ kind: "live", remote_id: "m-existing", payload: msgPayload() }),
    env({ kind: "live", remote_id: "m-new", payload: msgPayload() }),
  ] });
  expect(first.plan).toEqual({ "email.message": { total: 1, skipped: 0 } });

  const deleted = await mod.ingest({ generation: "forward:r:1", envelopes: [
    env({ kind: "delete", remote_id: "m-gone", payload: {} }),
    env({ kind: "delete", remote_id: "m-missing", payload: {} }),
  ] });
  expect(deleted.plan).toEqual({ "email.message": { total: -1, skipped: 0 } });
  expect(spy(graph, "delete_entity")).toHaveBeenCalledTimes(1);

  spy(graph, "find_by_anchors").mockImplementation((anchors: string[]) =>
    anchors.some((anchor) => anchor.startsWith("email:address:")) ? lookupAddresses(anchors) : Promise.resolve(anchors.map(() => "id-existing")));
  const replay = await mod.ingest({ generation: "forward:r:1", envelopes: [
    env({ kind: "live", remote_id: "m-new", payload: msgPayload() }),
  ] });
  expect(replay.plan).toEqual({ "email.message": { total: 0, skipped: 0 } });
});

describe("email ingest — DB-access guarantees (tst_be_emaildb_005 / INV-DB-3)", () => {
  let graph: G;
  let mod: EmailModule;
  beforeEach(() => {
    graph = ingestGraph();
    mod = mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
  });

  it("small page (msgs+addresses < 200) = exactly 1 apply_batch, 0 per-item crossings", async () => {
    await mod.ingest({
      envelopes: [
        env({ remote_id: "m1", payload: msgPayload() }),
        env({ remote_id: "m2", payload: msgPayload({ message_id: "mail-2" }) }),
        env({ remote_id: "m3", payload: msgPayload({ message_id: "mail-3" }) }),
      ],
    });
    expect(spy(graph, "apply_batch")).toHaveBeenCalledTimes(1);
    expect(spy(graph, "find_by_anchor")).toHaveBeenCalledTimes(0); // delete-only
    // create_entity / add_link / attach_facet (the per-item crossings) are
    // forbidden, unarranged ops — the throwing mockGraph guarantees they are
    // never hit; there is no spy to assert 0 against.
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

    const calls = spy(graph, "apply_batch").mock.calls;
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

/**
 * @test-id: tst_module_email_sync_003
 * @scenario: scn_google_sync_001
 * @covers: EmailModule.ingest
 * @deterministic: yes
 * @fixtures: unknown sender defaults off, then a changed module default and repeated discovery
 */
it("tst_module_email_sync_003 creates only selection metadata and preserves Stop when discovery repeats", async () => {
  const writes: GraphBatchInput[] = [];
  let sender: RawSyncableEntity | null = null;
  let rule = "false";
  const graph = mockGraph({
    find_by_anchors: (anchors) => Promise.resolve(anchors.map(() => sender?.id ?? null)),
    get_entities: () => Promise.resolve(sender === null ? [] : [sender]),
    moduleSettings: () => Promise.resolve({ newSenderSyncEnabled: rule }),
    admitSyncEntities: (subjects) => Promise.resolve(sender?.syncEnabled === true ? subjects.flatMap((subject) => [...subject.remoteIds]) : []),
    apply_batch: (batch) => {
      writes.push(batch);
      const address = batch.entities[0];
      if (address?.schema_id !== "email.address" || typeof address.syncEnabled !== "boolean") throw new Error("Expected explicit sender discovery");
      sender = { id: "sender", schema_id: address.schema_id, name: "unknown@example.com", properties: address.properties, indexed: true, syncEnabled: address.syncEnabled, syncRevision: "0" };
      return Promise.resolve({ ids: { [address.key]: "sender" }, created: 1, updated: 0, links_added: 0, dropped_keys: [] });
    },
  });
  const mod = mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
  const header = env({ payload: { entity_type: "sender", from_address: "unknown@example.com", from_name: "Name" } });
  expect(await mod.ingest({ envelopes: [header] })).toEqual({ dropped_remote_ids: [], trigger_checks: [] });
  rule = "true";
  await mod.ingest({ envelopes: [header, env({ remote_id: "late", kind: "live", payload: msgPayload({ from_address: "unknown@example.com", to_addresses: "", attachments: [{ attachment_id: "must-not-register" }] }) })] });
  expect(writes).toHaveLength(1);
  expect(writes[0]?.entities).toEqual([expect.objectContaining({ syncEnabled: false, properties: { address: "unknown@example.com", display_name: "Name" } })]);
});

it("fails id-only updates without ownership, while an unstored deletion has no effects", async () => {
  const graph = ingestGraph();
  spy(graph, "find_by_anchor").mockResolvedValue(null);
  const mod = mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
  await expect(mod.ingest({ envelopes: [env({ payload: { labels: ["INBOX"] } })] })).rejects.toThrow(/ownership/);
  await expect(mod.ingest({ envelopes: [env({ kind: "delete" })] })).resolves.toEqual({ dropped_remote_ids: [], trigger_checks: [] });
  expect(graph.spies.apply_batch).not.toHaveBeenCalled();
  expect(graph.spies.delete_entity).not.toHaveBeenCalled();
});

it("reuses a recipient created with Stop across chunks of the same page", async () => {
  const graph = ingestGraph();
  const find = spy(graph, "find_by_anchors").getMockImplementation();
  const apply = spy(graph, "apply_batch").getMockImplementation();
  if (find === undefined || apply === undefined) throw new Error("Missing batch fixture");
  spy(graph, "moduleSettings").mockResolvedValue({ newSenderSyncEnabled: "false" });
  spy(graph, "find_by_anchors").mockImplementation(async (anchors: string[]) => {
    const ids: (string | null)[] = await find(anchors);
    return ids.map((id, index) => anchors[index] === "email:address:shared@example.com" ? null : id);
  });
  let created = false;
  spy(graph, "apply_batch").mockImplementation((batch: GraphBatchInput) => {
    if (batch.entities.some((entity) => entity.anchor === "email:address:shared@example.com")) {
      if (created) throw new Error("sync disabled for shared recipient");
      created = true;
    }
    return apply(batch);
  });
  const mod = mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
  await mod.ingest({ envelopes: Array.from({ length: 100 }, (_, index) => env({
    remote_id: `m${index}`, payload: msgPayload({ to_addresses: `shared@example.com, recipient${index}@example.com` }),
  })) });
  expect(created).toBe(true);
  expect(spy(graph, "apply_batch").mock.calls.length).toBeGreaterThan(1);
});
