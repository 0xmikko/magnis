// Email ingest (@syncHandler): applyBatch parity + DB-access
// guarantees. Exercised through @magnis/testkit/module. Asserts the fragment
// shape (entities/links/addresses folded in), idempotency seams (external_ids),
// live trigger.check parity, delete, empty-user skip, and the op-count gate.
//
// mockGraph is a throwing Proxy: the per-item write ops (createEntity/
// attach_facet/addLink) are NOT arranged, so any per-item crossing throws —
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
import type { BatchEntityInput, BatchLink, EntityRead, GraphBatchInput, JsonObject, Syncable, SyncEnvelope } from "@magnis/sdk";
import { entity, entityRead, entityExtras, entityId, link, mockGraph, mountModule, sourceEnvelope, type MockGraph } from "@magnis/testkit/module";
import { EmailModule } from "../service.ts";
import { destSubpath } from "../helpers.ts";
import { message } from "../../entities.ts";
import type { EmailCanonical } from "../../types.ts";

type G = MockGraph;

/** A stored sender address with its saved synchronization choice. */
const syncable = (id: string, address: string, syncEnabled: boolean, syncRevision: string): EntityRead =>
  entityRead(entity(id, address, { schemaId: "email.address", properties: { address } }), entityExtras({ syncEnabled, syncRevision }));

function ingestGraph(): G {
  const addressRows = new Map<string, EntityRead>();
  return mockGraph({
    moduleSettings: () => Promise.resolve({ newSenderSyncEnabled: "true" }),
    admitSyncEntities: (subjects) => Promise.resolve(subjects.flatMap((subject) => [...subject.remoteIds])),
    getEntities: (ids) => Promise.resolve(ids.map((id) => {
      const row = addressRows.get(id);
      if (row === undefined) throw new Error(`Missing address fixture ${id}`);
      return row;
    })),
    getEntity: (id) => Promise.resolve(syncable(id, "ceo@example.com", true, "0")),
    getEntityFull: (id) => Promise.resolve({
      entity: entity(id, "Stored", { schemaId: "email.message" }),
      links: [link(id, entityId("id-addr:ceo@example.com"), "received_from", { id: `author-${id}` })],
    }),
    // applyBatch echoes each key → a deterministic id so post-apply can resolve.
    applyBatch: (frag) =>
      Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e) => [e.key, entityId(`id-${e.key}`)])),
        created: frag.entities.length,
        updated: 0,
        linksAdded: frag.links.length,
        droppedKeys: [], resolved: [],
      }),
    fileRegister: () => Promise.resolve("file-id"),
    findByExternalId: () => Promise.resolve(entityId("existing-id")),
    findByExternalIds: (externalIds) => Promise.resolve(externalIds.map((externalId) => {
      if (!externalId.startsWith("email:address:")) return null;
      const address = externalId.slice("email:address:".length);
      const id = entityId(`id-addr:${address}`);
      addressRows.set(id, syncable(id, address, true, "0"));
      return id;
    })),
    deleteEntity: () => Promise.resolve(undefined),
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

const env = (over: Partial<SyncEnvelope>): SyncEnvelope =>
  sourceEnvelope("email", {}, { sourceId: "google", accountId: "acct-1", userId: "u1", remoteId: "m1", timestamp: "2026-03-14T09:00:00Z", ...over });

/** A batch entity's dictionary, which the module always writes as an object. */
const dict = (entity: BatchEntityInput | undefined): JsonObject | undefined =>
  entity?.properties as JsonObject | undefined;

const msgPayload = (over: JsonObject = {}): JsonObject => ({
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
  const rows: (EntityRead)[] = [
    syncable(entityId("sender-a"), "a@example.com", true, "1"),
    syncable(entityId("sender-b"), "b@example.com", false, "2"),
  ];
  const batches: GraphBatchInput[] = [];
  const graph = mockGraph({
    findByExternalIds: (externalIds) => Promise.resolve(externalIds.map((externalId) => rows.find((row) => externalId === `email:address:${row.entity.name ?? ""}`)?.entity.id ?? null)),
    findByExternalId: (externalId) => Promise.resolve(externalId === "b-label" || externalId === "b-delete" ? entityId(`stored-${externalId}`) : null),
    getEntities: (ids) => Promise.resolve(rows.filter((row) => ids.includes(row.entity.id))),
    getEntity: (id) => Promise.resolve(rows.find((row) => row.entity.id === id) ?? null),
    getEntityFull: (id) => Promise.resolve({
      entity: entity(id, "Stored", { schemaId: "email.message", properties: { subject: "Stored" } }),
      links: [link(id, entityId("sender-b"), "received_from", { id: `author-${id}` })],
    }),
    admitSyncEntities: (subjects) => Promise.resolve(subjects.flatMap((subject) => subject.entityId === entityId("sender-a") ? [...subject.remoteIds] : [])),
    applyBatch: (batch) => {
      batches.push(batch);
      return Promise.resolve({ ids: Object.fromEntries([...batch.entities, ...batch.refs].map((item) => [item.key, entityId(`id-${item.key}`)])), created: batch.entities.length, updated: 0, linksAdded: batch.links.length, droppedKeys: [], resolved: [] });
    },
    fileRegister: () => Promise.resolve("file-id"),
    deleteEntity: () => Promise.resolve(),
  });
  const mod = mountModule(EmailModule, { graph, ctx: { extensionId: "email" } }).module;
  const result = await mod.ingest({ envelopes: [
    env({ remoteId: "mailbox", payload: { entity_type: "mailbox", messages_total: 100, skipped: 0 } }),
    env({ remoteId: "a-new", kind: "live", payload: msgPayload({ from_address: " A@EXAMPLE.com ", to_addresses: "b@example.com" }) }),
    env({ remoteId: "b-new", accountId: "acct-2", kind: "live", payload: msgPayload({ from_address: "B@example.com", attachments: [{ attachment_id: "blocked-file" }] }) }),
    env({ remoteId: "b-label", payload: { labels: ["INBOX"] } }),
    env({ remoteId: "b-delete", accountId: "acct-2", kind: "delete" }),
  ] });
  expect(batches.flatMap((batch) => batch.entities.filter((item) => item.schemaId === "email.message").map((item) => item.key))).toEqual(["a-new"]);
  expect(batches.flatMap((batch) => batch.entities).some((item) => item.externalId === "email:address:b@example.com")).toBe(false);
  expect(graph.spies.deleteEntity).not.toHaveBeenCalled();
  expect(graph.spies.fileRegister).not.toHaveBeenCalled();
  expect(result.triggerChecks.map((check) => check.entityId)).toEqual([entityId("id-a-new")]);
  expect(graph.spies.admitSyncEntities).toHaveBeenCalledExactlyOnceWith([
    { entityId: entityId("sender-a"), remoteIds: ["a-new"] },
    { entityId: entityId("sender-b"), remoteIds: ["b-new", "b-label", "b-delete"] },
  ], ["mailbox"]);
});

describe("email ingest — applyBatch shape (tst_be_emailingest_001)", () => {
  let graph: G;
  let mod: EmailModule;
  beforeEach(() => {
    graph = ingestGraph();
    mod = mountModule(EmailModule, { graph, ctx: { extensionId: "email" } }).module;
  });

  /**
   * @test-id: tst_module_email_ingest_002
   * @scenario: scn_google_pull_001
   * @covers: EmailModule.ingest
   * @deterministic: yes
   * @fixtures: flattened Gmail message with provider id, Message-ID header, null thread
   */
  it("tst_module_email_ingest_002 stores a Gmail payload in the declared message schema", async () => {
    const { message_id: _replaced, ...gmail } = msgPayload({
      id: "gmail-1", message_id_header: "<m1@example.com>", thread_id: null,
    });
    await mod.ingest({ envelopes: [env({ payload: gmail })] });
    const batch = spy(graph, "applyBatch").mock.calls[0]?.[0] as GraphBatchInput | undefined;
    const stored = batch?.entities.find((entity) => entity.schemaId === "email.message");
    expect(message.safeParse(stored?.properties).success).toBe(true);
    expect(dict(stored)?.message_id).toBe("<m1@example.com>");
  });

  it("folds messages + unique addresses + sent_from/sent_to links into one batch", async () => {
    await mod.ingest({
      envelopes: [
        env({ remoteId: "m1", payload: msgPayload() }),
        env({ remoteId: "m2", payload: msgPayload({ message_id: "mail-2", from_address: "ceo@example.com", to_addresses: "me@example.com" }) }),
      ],
    });

    expect(spy(graph, "applyBatch")).toHaveBeenCalledTimes(1);
    const applyCall0 = spy(graph, "applyBatch").mock.calls[0];
    if (applyCall0 === undefined) throw new Error("ingest: applyBatch not called");
    const frag = applyCall0[0] as GraphBatchInput;

    const msgs = frag.entities.filter((e: BatchEntityInput) => e.schemaId === "email.message");
    const addrs = frag.entities.filter((e: BatchEntityInput) => e.schemaId === "email.address");
    expect(msgs.map((m) => m.key).sort()).toEqual(["m1", "m2"]);
    // unique, lowercased addresses: ceo@, me@, ops@ (m1+m2 share ceo@ and me@)
    expect(addrs.map((a) => a.idx).sort()).toEqual(["ceo@example.com", "me@example.com", "ops@example.com"]);

    // message entity: name=subject, idx=thread_id, date=sent_at, externalId=remoteId
    const m1 = msgs.find((m) => m.key === "m1")!;
    expect(m1.name).toBe("Report Q3");
    expect(m1.idx).toBe("thread-1");
    expect(m1.date).toBe("2026-03-14T09:00:00Z");
    // S5: the message node is its DICTIONARY under the remoteId external id —
    // the details record retired, and the fields the edges now represent
    // (attachments, the joined recipient strings) left the dict.
    expect(m1.externalId).toBe("m1");
    expect(dict(m1)?.subject).toBe("Report Q3");
    expect(dict(m1)?.attachments).toBeUndefined();
    expect(dict(m1)?.to_addresses).toBeUndefined();

    // address entity resolves by its chokepoint external id (idempotent)
    const ceo = addrs.find((a) => a.idx === "ceo@example.com")!;
    expect(ceo.externalId).toBe("email:address:ceo@example.com");
    expect(dict(ceo)?.address).toBe("ceo@example.com");

    // links: sent_from (msg→sender) + sent_to (msg→each recipient)
    const links = frag.links;
    const m1from = links.filter((l: BatchLink) => l.fromKey === "m1" && l.kind === "received_from");
    const m1to = links.filter((l: BatchLink) => l.fromKey === "m1" && l.kind === "sent_to");
    expect(m1from).toHaveLength(1);
    const m1from0 = m1from[0];
    if (m1from0 === undefined) throw new Error("ingest: missing m1from[0] link");
    expect(m1from0.toKey).toBe("addr:ceo@example.com");
    expect(m1to.map((l) => l.toKey).sort()).toEqual(["addr:me@example.com", "addr:ops@example.com"]);
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
          remoteId: "dup-1",
          payload: {
            subject: "Dup",
            from_address: "boss@corp.com",
            to_addresses: "ann@x.com",
            cc_addresses: "ann@x.com, ben@x.com",
          },
        }),
      ],
    });
    const call = spy(graph, "applyBatch").mock.calls[0] as [GraphBatchInput] | undefined;
    if (call === undefined) throw new Error("ingest: applyBatch never called");
    const sentTo = call[0].links.filter((l) => l.kind === "sent_to");
    const ann = sentTo.find((l) => l.toKey === "addr:ann@x.com");
    const ben = sentTo.find((l) => l.toKey === "addr:ben@x.com");
    expect(ann?.metadata).toEqual({ role: "to" });
    expect(ben?.metadata).toEqual({ role: "cc" });
  });

  it("folds Cc + Bcc recipients into address entities + sent_to links", async () => {
    await mod.ingest({
      envelopes: [
        env({
          remoteId: "m1",
          payload: msgPayload({
            to_addresses: "to@x.com",
            cc_addresses: "Cc1@x.com, cc2@x.com",
            bcc_addresses: "bcc@x.com",
          }),
        }),
      ],
    });
    const applyCall0 = spy(graph, "applyBatch").mock.calls[0];
    if (applyCall0 === undefined) throw new Error("ingest cc/bcc: applyBatch not called");
    const frag = applyCall0[0] as GraphBatchInput;
    const addrIdx = frag.entities
      .filter((e: BatchEntityInput) => e.schemaId === "email.address")
      .map((e) => e.idx)
      .sort();
    // sender + to + cc(×2, lowercased) + bcc — all folded as address entities
    expect(addrIdx).toEqual(["bcc@x.com", "cc1@x.com", "cc2@x.com", "ceo@example.com", "to@x.com"]);
    const sentTo = (frag.links)
      .filter((l: BatchLink) => l.kind === "sent_to")
      .map((l) => l.toKey)
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
            remoteId: "m1",
            payload: msgPayload({ to_addresses: "to@x.com", cc_addresses: "cc@x.com", bcc_addresses: "bcc@x.com" }),
          }),
        ],
      })
    ).triggerChecks;
    expect(triggers).toHaveLength(1);
    const trigger0 = triggers[0];
    if (trigger0 === undefined) throw new Error("ingest: missing trigger[0]");
    expect(trigger0.touchedEntityIds).not.toEqual(
      expect.arrayContaining([entityId("id-addr:cc@x.com"), entityId("id-addr:bcc@x.com"), entityId("id-addr:to@x.com")]),
    );
    expect(trigger0.touchedEntityIds).toEqual([entityId("id-m1"), entityId("id-addr:ceo@example.com")]);
  });

  // tst_be_emailingest_trigger_007 — INV-10. The engine needs the event's own
  // time to refuse history; without it a delayed backfill fired a trigger that
  // was created afterwards.
  it("LIVE trigger context carries the message's occurred_at", async () => {
    const triggers = (
      await mod.ingest({
        envelopes: [env({ kind: "live", remoteId: "m1", payload: msgPayload() })],
      })
    ).triggerChecks;
    const trigger0 = triggers[0];
    if (trigger0 === undefined) throw new Error("ingest: missing trigger[0]");
    expect(trigger0.context).toHaveProperty("occurred_at");
    expect((trigger0.context as JsonObject).occurred_at).toBeTruthy();
  });

  it("registers each attachment via fileRegister with native-parity ids", async () => {
    await mod.ingest({
      envelopes: [
        env({
          remoteId: "m1",
          payload: msgPayload({
            attachments: [
              { attachment_id: "att-1", filename: "photo.jpg", mime_type: "image/jpeg", size: 150000 },
            ],
          }),
        }),
      ],
    });
    expect(spy(graph, "fileRegister")).toHaveBeenCalledTimes(1);
    const fileCall0 = spy(graph, "fileRegister").mock.calls[0];
    if (fileCall0 === undefined) throw new Error("ingest: fileRegister not called");
    const call = fileCall0[0] as Record<string, unknown>;
    expect(call.externalId).toBe("file:gmail:acct-1:m1:att-1");
    expect(call.parentExternalId).toBe("m1");
    expect(call.linkKind).toBe("file.attachment");
    expect(call.name).toBe("photo.jpg");
    expect(call.mimeType).toBe("image/jpeg");
    expect(call.sourceModule).toBe("google");
    expect(call.sourceSurface).toBe("email");
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
    expect(spy(graph, "fileRegister").mock.calls[0]?.[0].download).toBe(false);
    await mod.ingest({ envelopes: [env({ kind: "live", remoteId: "m2", payload })] });
    expect(spy(graph, "fileRegister").mock.calls[1]?.[0].download).toBe(true);
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

  // tst_fe_email_media_source_routing_001: sourceModule must be the ENVELOPE's
  // sourceId — the host file worker routes download_file by (sourceModule,
  // sourceSurface). A hardcoded "google" breaks attachment downloads when the
  // email surface is served by a differently-named connector (google-ts).
  it("stamps the envelope's sourceId as sourceModule (google-ts connector)", async () => {
    await mod.ingest({
      envelopes: [
        env({
          sourceId: "google-ts",
          remoteId: "m1",
          payload: msgPayload({
            attachments: [
              { attachment_id: "att-1", filename: "photo.jpg", mime_type: "image/jpeg", size: 150000 },
            ],
          }),
        }),
      ],
    });
    const fileCall0 = spy(graph, "fileRegister").mock.calls[0];
    if (fileCall0 === undefined) throw new Error("ingest: fileRegister not called");
    const call = fileCall0[0] as Record<string, unknown>;
    expect(call.sourceModule).toBe("google-ts");
    expect(call.sourceSurface).toBe("email");
  });
});

describe("email ingest — trigger / delete / empty-user parity", () => {
  let graph: G;
  let mod: EmailModule;
  beforeEach(() => {
    graph = ingestGraph();
    mod = mountModule(EmailModule, { graph, ctx: { extensionId: "email" } }).module;
  });

  it("LIVE → one trigger.check (touched = message + sender only); SNAPSHOT → none", async () => {
    const live = await mod.ingest({ envelopes: [env({ kind: "live", remoteId: "m1", payload: msgPayload() })] });
    expect(Object.keys(live).sort()).toEqual(["droppedRemoteIds", "excluded", "plan", "triggerChecks"]);
    expect(live.triggerChecks).toHaveLength(1);
    const tc = live.triggerChecks[0];
    if (tc === undefined) throw new Error("ingest: missing live triggerChecks[0]");
    expect(tc.eventKind).toBe("new_email");
    expect(tc.entityId).toBe(entityId("id-m1"));
    expect(tc.context).toMatchObject({ from_address: "CEO@example.com" });
    // INV-9: message id + the SENDER's address id. Recipients are deliberately
    // absent — including them made the user's own address a trigger candidate.
    expect(tc.touchedEntityIds).toEqual([entityId("id-m1"), entityId("id-addr:ceo@example.com")]);
    expect(tc.touchedEntityIds).not.toContain(entityId("id-addr:me@example.com"));

    const snap = await mod.ingest({ envelopes: [env({ kind: "snapshot", remoteId: "m2", payload: msgPayload() })] });
    expect(snap.triggerChecks).toHaveLength(0);
  });

  it("DELETE → findByExternalId + deleteEntity, no applyBatch", async () => {
    await mod.ingest({ envelopes: [env({ kind: "delete", remoteId: "m-del", payload: {} })] });
    expect(spy(graph, "findByExternalId")).toHaveBeenCalledTimes(1);
    expect(spy(graph, "deleteEntity")).toHaveBeenCalledWith(entityId("existing-id"));
    expect(spy(graph, "applyBatch")).toHaveBeenCalledTimes(0);
  });

  it("empty userId → skipped (no batch, no entity)", async () => {
    const r = await mod.ingest({ envelopes: [env({ userId: "", remoteId: "m1", payload: msgPayload() })] });
    expect(spy(graph, "applyBatch")).toHaveBeenCalledTimes(0);
    expect(r.triggerChecks).toHaveLength(0);
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
    mod = mountModule(EmailModule, { graph, ctx: { extensionId: "email" } }).module;
  });
  const mailbox = env({ remoteId: "mailbox", payload: { entity_type: "mailbox", messages_total: 100, skipped: 10 } });

  it("states the mailbox in full and never ingests it as a message", async () => {
    const r = await mod.ingest({ generation: "initial:r:1", envelopes: [mailbox, env({ remoteId: "m1", payload: msgPayload() })] });
    expect(r).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: { "email.message": { total: 100, skipped: 10 } }, excluded: [] });
    const batch = spy(graph, "applyBatch").mock.calls[0]?.[0] as GraphBatchInput | undefined;
    expect(batch?.entities.map((item) => item.key)).not.toContain("mailbox");
    expect(batch?.entities.some((item) => item.key === "m1")).toBe(true);
  });

  it("moves the count by one per new mail and per removal on a history page", async () => {
    const r = await mod.ingest({ generation: "initial:r:1", envelopes: [
      env({ kind: "live", remoteId: "m-new", payload: msgPayload({ message_id: "m-new" }) }),
      env({ kind: "snapshot", remoteId: "m-relabelled", payload: msgPayload({ message_id: "m-relabelled" }) }),
      env({ kind: "delete", remoteId: "m-gone", payload: {} }),
      env({ kind: "delete", remoteId: "m-gone-too", payload: {} }),
    ] });
    expect(r.plan).toEqual({ "email.message": { total: -1, skipped: 0 } });
  });

  it("states nothing outside a worker's pass", async () => {
    const r = await mod.ingest({ envelopes: [mailbox, env({ kind: "live", remoteId: "m-new", payload: msgPayload() })] });
    expect(r).toEqual({ droppedRemoteIds: [], triggerChecks: expect.any(Array) as never, plan: null, excluded: [] });
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
  const mod = mountModule(EmailModule, { graph, ctx: { extensionId: "email" } }).module;
  const lookupAddresses = spy(graph, "findByExternalIds").getMockImplementation();
  if (lookupAddresses === undefined) throw new Error("Missing address lookup fixture");
  spy(graph, "findByExternalIds").mockImplementation((externalIds: string[]) =>
    externalIds.some((externalId) => externalId.startsWith("email:address:")) ? lookupAddresses(externalIds) : Promise.resolve(externalIds.map((externalId) => externalId === "m-existing" ? entityId("id-existing") : null)));
  spy(graph, "findByExternalId").mockImplementation((externalId: string) =>
    Promise.resolve(externalId === "m-gone" ? entityId("id-gone") : null));

  const first = await mod.ingest({ generation: "forward:r:1", envelopes: [
    env({ kind: "live", remoteId: "m-existing", payload: msgPayload() }),
    env({ kind: "live", remoteId: "m-new", payload: msgPayload() }),
  ] });
  expect(first.plan).toEqual({ "email.message": { total: 1, skipped: 0 } });

  const deleted = await mod.ingest({ generation: "forward:r:1", envelopes: [
    env({ kind: "delete", remoteId: "m-gone", payload: {} }),
    env({ kind: "delete", remoteId: "m-missing", payload: {} }),
  ] });
  expect(deleted.plan).toEqual({ "email.message": { total: -1, skipped: 0 } });
  expect(spy(graph, "deleteEntity")).toHaveBeenCalledTimes(1);

  spy(graph, "findByExternalIds").mockImplementation((externalIds: string[]) =>
    externalIds.some((externalId) => externalId.startsWith("email:address:")) ? lookupAddresses(externalIds) : Promise.resolve(externalIds.map(() => entityId("id-existing"))));
  const replay = await mod.ingest({ generation: "forward:r:1", envelopes: [
    env({ kind: "live", remoteId: "m-new", payload: msgPayload() }),
  ] });
  expect(replay.plan).toEqual({ "email.message": { total: 0, skipped: 0 } });
});

describe("email ingest — DB-access guarantees (tst_be_emaildb_005 / INV-DB-3)", () => {
  let graph: G;
  let mod: EmailModule;
  beforeEach(() => {
    graph = ingestGraph();
    mod = mountModule(EmailModule, { graph, ctx: { extensionId: "email" } }).module;
  });

  it("small page (msgs+addresses < 200) = exactly 1 applyBatch, 0 per-item crossings", async () => {
    await mod.ingest({
      envelopes: [
        env({ remoteId: "m1", payload: msgPayload() }),
        env({ remoteId: "m2", payload: msgPayload({ message_id: "mail-2" }) }),
        env({ remoteId: "m3", payload: msgPayload({ message_id: "mail-3" }) }),
      ],
    });
    expect(spy(graph, "applyBatch")).toHaveBeenCalledTimes(1);
    expect(spy(graph, "findByExternalId")).toHaveBeenCalledTimes(0); // delete-only
    // createEntity / addLink / attach_facet (the per-item crossings) are
    // forbidden, unarranged ops — the throwing mockGraph guarantees they are
    // never hit; there is no spy to assert 0 against.
  });

  it("large page chunks by TOTAL entities — >1 applyBatch, each ≤200, all messages applied", async () => {
    // 100 messages, each with a unique sender + 2 unique recipients = 1 msg + 3
    // address entities = 4 entities/msg → 400 total → must split into ≥2 chunks,
    // none exceeding 200, and never split a single message.
    const envelopes = Array.from({ length: 100 }, (_, i) =>
      env({
        remoteId: `m${i}`,
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

    const calls = spy(graph, "applyBatch").mock.calls;
    expect(calls.length).toBeGreaterThan(1); // chunked, not one giant batch
    const seenMsgKeys = new Set<string>();
    for (const [frag] of calls as [GraphBatchInput][]) {
      expect(frag.entities.length).toBeLessThanOrEqual(200); // cap holds per chunk
      for (const e of frag.entities) {
        if (e.schemaId === "email.message") seenMsgKeys.add(e.key);
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
  let sender: EntityRead | null = null;
  let rule = "false";
  const graph = mockGraph({
    findByExternalIds: (externalIds) => Promise.resolve(externalIds.map(() => sender?.entity.id ?? null)),
    getEntities: () => Promise.resolve(sender === null ? [] : [sender]),
    moduleSettings: () => Promise.resolve({ newSenderSyncEnabled: rule }),
    admitSyncEntities: (subjects) => Promise.resolve(sender?.extras.syncEnabled === true ? subjects.flatMap((subject) => [...subject.remoteIds]) : []),
    applyBatch: (batch) => {
      writes.push(batch);
      const address: BatchEntityInput | undefined = batch.entities[0];
      if (address?.schemaId !== "email.address" || typeof address.syncEnabled !== "boolean") throw new Error("Expected explicit sender discovery");
      sender = entityRead(entity(entityId("sender"), "unknown@example.com", { schemaId: address.schemaId, properties: address.properties }), entityExtras({ syncEnabled: address.syncEnabled, syncRevision: "0" }));
      return Promise.resolve({ ids: { [address.key]: entityId("sender") }, created: 1, updated: 0, linksAdded: 0, droppedKeys: [], resolved: [] });
    },
  });
  const mod = mountModule(EmailModule, { graph, ctx: { extensionId: "email" } }).module;
  const header = env({ payload: { entity_type: entityId("sender"), from_address: "unknown@example.com", from_name: "Name" } });
  expect(await mod.ingest({ envelopes: [header] })).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] });
  rule = "true";
  await mod.ingest({ envelopes: [header, env({ remoteId: "late", kind: "live", payload: msgPayload({ from_address: "unknown@example.com", to_addresses: "", attachments: [{ attachment_id: "must-not-register" }] }) })] });
  expect(writes).toHaveLength(1);
  expect(writes[0]?.entities).toEqual([expect.objectContaining({ syncEnabled: false, properties: { address: "unknown@example.com", display_name: "Name" } })]);
});

it("fails id-only updates without ownership, while an unstored deletion has no effects", async () => {
  const graph = ingestGraph();
  spy(graph, "findByExternalId").mockResolvedValue(null);
  const mod = mountModule(EmailModule, { graph, ctx: { extensionId: "email" } }).module;
  await expect(mod.ingest({ envelopes: [env({ payload: { labels: ["INBOX"] } })] })).rejects.toThrow(/ownership/);
  await expect(mod.ingest({ envelopes: [env({ kind: "delete" })] })).resolves.toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] });
  expect(graph.spies.applyBatch).not.toHaveBeenCalled();
  expect(graph.spies.deleteEntity).not.toHaveBeenCalled();
});

it("reuses a recipient created with Stop across chunks of the same page", async () => {
  const graph = ingestGraph();
  const find = spy(graph, "findByExternalIds").getMockImplementation();
  const apply = spy(graph, "applyBatch").getMockImplementation();
  if (find === undefined || apply === undefined) throw new Error("Missing batch fixture");
  spy(graph, "moduleSettings").mockResolvedValue({ newSenderSyncEnabled: "false" });
  spy(graph, "findByExternalIds").mockImplementation(async (externalIds: string[]) => {
    const ids: (string | null)[] = await find(externalIds);
    return ids.map((id, index) => externalIds[index] === "email:address:shared@example.com" ? null : id);
  });
  let created = false;
  spy(graph, "applyBatch").mockImplementation((batch: GraphBatchInput) => {
    if (batch.entities.some((item) => item.externalId === "email:address:shared@example.com")) {
      if (created) throw new Error("sync disabled for shared recipient");
      created = true;
    }
    return apply(batch);
  });
  const mod = mountModule(EmailModule, { graph, ctx: { extensionId: "email" } }).module;
  await mod.ingest({ envelopes: Array.from({ length: 100 }, (_, index) => env({
    remoteId: `m${index}`, payload: msgPayload({ to_addresses: `shared@example.com, recipient${index}@example.com` }),
  })) });
  expect(created).toBe(true);
  expect(spy(graph, "applyBatch").mock.calls.length).toBeGreaterThan(1);
});
