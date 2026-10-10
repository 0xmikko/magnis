// tst_plugin_x_ingest — sync ingest builds an idempotent applyBatch
// (profiles + posts + authored_by link, each node keyed by its remote id as
// its externalId) and read tools map window entities. Doubles come from
// @magnis/testkit/module (throwing mockGraph — a read/ingest path hitting an
// unarranged op fails loudly).
import { describe, expect, it, vi } from "vitest";
import type { Entity, PersistentEntity, PersistentEntityId, EntityRead, GraphBatchInput, JsonObject, JsonValue, Link, Syncable, SyncEnvelope, SyncHookParams, SyncMigrationEntity } from "@magnis/sdk";
import { entity, entityRead, entityExtras, entityId, link, mockGraph, mountModule, page, sourceEnvelope, syncStateDouble, type MockGraph } from "@magnis/testkit/module";
import { ContactsModule } from "../../../contacts/module/service.ts";
import { XModule } from "../service.ts";

type G = MockGraph;

function mountX(graph: G, execute: (method: string, params?: unknown) => unknown = vi.fn()): XModule {
  return mountModule<XModule>(XModule, {
    graph,
    ctx: { extensionId: "x" },
    rpc: { execute },
  }).module;
}

function env(remoteId: string, payload: JsonObject): SyncEnvelope {
  return sourceEnvelope("x", payload, { sourceId: "x", accountId: "a1", userId: "u1", remoteId, timestamp: "2026-06-26T00:00:00Z" });
}

/** A stored X profile with its saved synchronization choice. */
function profileEntity(id: string, name: string, externalId: string, properties: JsonObject, syncEnabled: boolean, syncRevision: string): PersistentEntity & Syncable {
  return { ...entity(id, name, { schemaId: "x.profile", source: { source: "test", account: "a1", externalId }, properties }), syncEnabled, syncRevision };
}

function storedRead(row: PersistentEntity & Syncable): EntityRead {
  const { syncEnabled, syncRevision, ...value } = row;
  return entityRead(value, entityExtras({ syncEnabled, syncRevision }));
}

const stated = { droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] };
const ready: SyncHookParams = { userId: "u1", sourceId: "x", accountId: "x-account", identityKey: null };
const trackingOf = (contact: Entity): unknown => (contact.properties as JsonObject).tracking;

function ingestGraph(): G {
  const profile = profileEntity("profile-12", "Jack", "x:profile:12", { handle: "jack" }, true, "0");
  return mockGraph({
    findByExternalIds: async (externalIds) => externalIds.map(externalId => externalId === "x:profile:12" ? profile.id : null),
    getEntities: async (ids, opts) => ids.includes(profile.id) ? [opts?.extras ? storedRead(profile) : storedRead(profile).entity] : [],
    getEntity: async (id, opts) => id === profile.id ? opts?.extras ? storedRead(profile) : storedRead(profile).entity : null,
    listSyncMigrationEntities: async () => ({ items: [{ id: profile.id, schemaId: "x.profile", name: "Jack", indexed: true, isPinned: null, properties: { handle: "jack" }, syncEnabled: true, syncRevision: "0" }], next: null }),
    admitSyncEntities: async (subjects) => subjects.flatMap(subject => [...subject.remoteIds]),
    applyBatch: async () => ({ ids: {}, created: 0, updated: 0, linksAdded: 0, droppedKeys: [], resolved: [] }),
    listEntitiesWindow: async () => page([]),
    getEntityFull: async () => null,
  });
}

describe("x ingest", () => {
  it("tst_plugin_x_ingest_001 builds one applyBatch with profile+post+link, each node keyed by its externalId", async () => {
    const graph = ingestGraph();
    const mod = mountX(graph);

    const res = await mod.ingest({
      envelopes: [
        env("x:profile:12", {
          entity_type: "profile",
          platform: "x",
          handle: "jack",
          display_name: "Jack",
          follower_count: 100,
        }),
        env("x:post:1", {
          entity_type: "post",
          platform: "x",
          post_id: "1",
          author_handle: "Jack",
          text: "hello world",
          created_at: "2026-06-26T00:00:00Z",
          metrics: { likes: 5 },
        }),
      ],
    });

    expect(res).toEqual(stated);
    const applyBatch = graph.spies.applyBatch;
    if (applyBatch === undefined) throw new Error("x ingest 001: missing applyBatch spy");
    expect(applyBatch).toHaveBeenCalledTimes(1);
    const batchCall = applyBatch.mock.calls[0];
    if (batchCall === undefined) throw new Error("x ingest 001: no applyBatch call recorded");
    const batch = batchCall[0] as GraphBatchInput;
    expect(batch.entities).toHaveLength(2);

    const profile = batch.entities.find((e) => e.schemaId === "x.profile")!;
    const post = batch.entities.find((e) => e.schemaId === "x.post")!;
    // The dictionary IS the record; X renames handles, never account ids, so
    // the remote id is the externalId.
    expect(profile.externalId).toBe("x:profile:12");
    expect(profile.properties).toMatchObject({ handle: "jack", follower_count: 100 });
    expect(post.externalId).toBe("x:post:1");
    // content AND metrics in ONE dictionary.
    expect(post.properties).toMatchObject({ text: "hello world", metrics: { likes: 5 } });
    // authored_by link wired within the page (author_handle "Jack" → profile "jack").
    expect(batch.links).toEqual([
      {
        fromKey: "x:post:1",
        toKey: "x:profile:12",
        kind: "authored_by",
        confidence: null,
        metadata: null,
        declaredBy: "x:post:1",
        validFrom: null,
        validUntil: null,
      },
    ]);
  });

  it("tst_plugin_x_ingest_002 re-ingest keeps the same externalId (idempotent)", async () => {
    const graph = ingestGraph();
    const mod = mountX(graph);
    const payload = {
      entity_type: "post",
      platform: "x",
      post_id: "1",
      author_handle: "jack",
      text: "v1",
    };

    await mod.ingest({ envelopes: [env("x:post:1", payload)] });
    await mod.ingest({ envelopes: [env("x:post:1", { ...payload, text: "v2" })] });

    const applyBatch = graph.spies.applyBatch;
    if (applyBatch === undefined) throw new Error("x ingest 002: missing applyBatch spy");
    const firstCall = applyBatch.mock.calls[0];
    const secondCall = applyBatch.mock.calls[1];
    if (firstCall === undefined || secondCall === undefined) throw new Error("x ingest 002: missing applyBatch call");
    const firstEntity = (firstCall[0] as GraphBatchInput).entities[0];
    const secondEntity = (secondCall[0] as GraphBatchInput).entities[0];
    if (firstEntity === undefined || secondEntity === undefined) throw new Error("x ingest 002: missing batch entity");
    expect(firstEntity.externalId).toBe("x:post:1");
    expect(secondEntity.externalId).toBe("x:post:1"); // same externalId → upsert, no duplicate
  });

  it("tst_plugin_x_ingest_003 posts.list maps window entities", async () => {
    const graph = ingestGraph();
    const mod = mountX(graph);
    const listWindow = graph.spies.listEntitiesWindow;
    if (listWindow === undefined) throw new Error("x ingest 003: missing listEntitiesWindow spy");
    listWindow.mockResolvedValue(page([
      entity("p1", "hello", {
        schemaId: "x.post",
        properties: {
          platform: "x",
          author_handle: "jack",
          text: "hello",
          created_at: "t",
          url: null,
        },
      }),
    ]));

    const listed = await mod.postsList({});
    expect(listed.total).toBe(1);
    expect(listed.items[0]).toMatchObject({ id: entityId("p1"), platform: "x", author_handle: "jack", text: "hello" });
    expect(graph.spies.listEntitiesWindow).toHaveBeenCalledTimes(1);
  });
});

/**
 * @test-id: tst_plugin_x_plan_001
 * @scenario: scn_x_sync_001
 * @covers: XModule.ingest (plan)
 * @deterministic: yes
 * @fixtures: a profile envelope with a planned window of 10; two posts, one already in the graph
 */
describe("x ingest — the plan from the pages", () => {
  const profile = (over: JsonObject = {}): SyncEnvelope => env("x:profile:12", {
    entity_type: "profile", platform: "x", handle: "jack", display_name: "Jack", posts_total: 10, posts_skipped: 1190, ...over,
  });
  const post = (id: string): SyncEnvelope => ({ ...env(`x:post:${id}`, { entity_type: "post", platform: "x", post_id: id, author_handle: "jack", text: `post ${id}`, created_at: "2026-06-01T00:00:00Z", metrics: {} }), kind: "live" });
  function planGraph(known: Record<string, JsonObject>): G {
    const rows = new Map([...new Set(["x:profile:12", ...Object.keys(known)])].map(externalId => {
      const row = profileEntity(entityId(`id:${externalId}`), "", externalId, known[externalId] ?? { handle: "jack" }, true, "0");
      return [row.id, row];
    }));
    return mockGraph({
      admitSyncEntities: async (subjects) => subjects.flatMap(subject => [...subject.remoteIds]),
      findByExternalIds: (externalIds: string[]) => Promise.resolve(externalIds.map((externalId) => (externalId === "x:profile:12" || externalId in known ? entityId(`id:${externalId}`) : null))),
      getEntities: async (ids, opts) => ids.map(id => {
        const row = rows.get(entityId(id));
        if (row === undefined) throw new Error("Missing fixture row");
        const read = storedRead(row);
        return opts?.extras ? read : read.entity;
      }),
      applyBatch: () => Promise.resolve({ ids: {}, created: 0, updated: 0, linksAdded: 0, droppedKeys: [], resolved: [] }),
    });
  }

  it("states profiles and the posts window on a new pass, stamps the pass, and one per new post afterwards", async () => {
    // The profile is unknown: a new pass.
    const fresh = planGraph({});
    const first = await mountX(fresh).ingest({ generation: "initial:r:1", envelopes: [profile(), post("1"), post("2")] });
    expect(first).toEqual({ ...stated, plan: { "x.profile": { total: 1, skipped: 0 }, "x.post": { total: 10, skipped: 1190 } } });
    const batch = fresh.spies.applyBatch?.mock.calls[0]?.[0] as GraphBatchInput;
    expect(batch.entities.find((item) => item.schemaId === "x.profile")?.properties).toMatchObject({ handle: "jack", sync_pass: "initial:r:1" });

    // The same pass, a later poll: the profile is stamped; post 1 is known, post 3 is new.
    const stamped = planGraph({ "x:profile:12": { handle: "jack", sync_pass: "initial:r:1" }, "x:post:1": {} });
    const later = await mountX(stamped).ingest({ generation: "initial:r:1", envelopes: [profile(), post("1"), post("3")] });
    expect(later.plan).toEqual({ "x.profile": { total: 0, skipped: 0 }, "x.post": { total: 1, skipped: 0 } });

    // A new pass states the profile and its window in full again.
    const next = await mountX(stamped).ingest({ generation: "initial:r:2", envelopes: [profile(), post("1")] });
    expect(next.plan).toEqual({ "x.profile": { total: 1, skipped: 0 }, "x.post": { total: 10, skipped: 1190 } });

    // Outside a worker's pass nothing is read and nothing is stated.
    const outside = await mountX(ingestGraph()).ingest({ envelopes: [profile(), post("1")] });
    expect(outside).toEqual(stated);
  });
});

// Legacy contact links and placeholder names are migrated before acquisition.
// The restartable migration tests below exercise that path through Contacts.

// tst_profiles_search (live bug 2026-07-03): the framework list pane passes
// `search` into profiles.list; the tool must accept it (schema) and filter by
// name — previously additionalProperties:false rejected the call and the
// standard search box silently did nothing on this module.
describe("x profiles.list search", () => {
  it("search → searchEntitiesByName, dictionaries ride the rows, BACKEND order preserved", async () => {
    const graph = mockGraph({
      searchEntitiesByName: () =>
        Promise.resolve([
          entity("e2", "Bob Builder", {
            schemaId: "x.profile",
            properties: { handle: "bob", follower_count: 7, avatar_url: null },
          }),
          entity("e1", "Ann Doe", {
            schemaId: "x.profile",
            properties: { handle: "ann", follower_count: 5, avatar_url: "https://a/1.jpg" },
          }),
        ]),
    });
    const mod = mountX(graph);

    const r = await mod.profilesList({ search: "o", limit: 10 });
    expect(graph.spies.searchEntitiesByName).toHaveBeenCalledWith(
      expect.objectContaining({ query: "o", schemaIds: ["x.profile"] }),
    );
    // Backend order (stable total order) is preserved — no client re-sort
    // (re-sorting broke pagination windows, live bug #3).
    expect(r.items.map((i) => i.display_name)).toEqual(["Bob Builder", "Ann Doe"]);
    expect(r.items[1]).toMatchObject({ handle: "ann", follower_count: 5 });
  });
});

// tst_search_paging (live bug 2026-07-03 #2): search results must page — the
// old pattern capped the search fetch at limit+offset, so total never exceeded
// the shown rows and hasMore (= items.length < total) was always false: the
// standard infinite scroll silently died in search mode.
describe("x profiles.list search pagination", () => {
  function pagingGraph(dataset: { id: string; name: string }[]): G {
    return mockGraph({
      searchEntitiesByName: (p) =>
        Promise.resolve(dataset.slice(0, p.limit).map((d) => entity(d.id, d.name, { schemaId: "x.profile" }))),
    });
  }
  const dataset = [
    { id: "e1", name: "Ann" },
    { id: "e2", name: "Bob" },
    { id: "e3", name: "Cat" },
  ];

  it("page 1: total exceeds shown rows so hasMore stays true", async () => {
    const mod = mountX(pagingGraph(dataset));
    const r = await mod.profilesList({ search: "a", limit: 2, offset: 0 });
    expect(r.items).toHaveLength(2);
    expect(r.total).toBeGreaterThan(2); // items.length < total → framework loads more
  });

  it("page 2: returns the tail with an exact total", async () => {
    const mod = mountX(pagingGraph(dataset));
    const r = await mod.profilesList({ search: "a", limit: 2, offset: 2 });
    expect(r.items.map((i) => i.display_name)).toEqual(["Cat"]);
    expect(r.total).toBe(3);
  });
});

/** @test-id: tst_module_x_sync_001
 * @scenario: scn_x_sync_001
 * @covers: XModule migration, selection and approved resolution
 * @deterministic: yes
 * @fixtures: conflicting legacy contacts resolve to the same stable provider ID
 */
describe("X profile synchronization migration", () => {
  it("reports conflicting contact choices before creating a profile or requesting posts", async () => {
    const contacts = [true, false].map((enabled, index) => entity(`contact-${index}`, "Jack", {
      schemaId: "contacts.person", properties: { tracking: [{ platform: "x", handle: index === 0 ? "Jack" : "jack", enabled }] },
    }));
    const graph = mockGraph({
      listEntitiesWindow: async () => page(contacts),
      listSyncMigrationEntities: async () => ({ items: [], next: null }),
      listLinksForEntities: async () => [],
      syncState: syncStateDouble({ status: () => Promise.resolve({ accounts: [{ accountId: "x-account", sync: null }] }) }),
      sourceCommand: async () => ({ providerId: "12", handle: "jack", displayName: "Jack", bio: null, avatarUrl: null }),
      findByExternalId: async () => null,
      findByExternalIds: async (externalIds) => externalIds.map(() => null),
      getEntities: async () => [],
      applyBatch: async () => { throw new Error("Conflict must not initialize a profile"); },
    });
    const mounted = await mountModule(XModule, { mode: "dispatch", graph, ctx: { extensionId: "x" } });
    const status = await mounted.rpc("x.profile.syncMigration", {});
    expect(status).toMatchObject({ complete: false, issues: [{
      target: { schemaId: "x.profile", key: "x:profile:12" }, legacyIds: [entityId("contact-0"), entityId("contact-1")],
    }] });
    expect(graph.spies.applyBatch).not.toHaveBeenCalled();
    expect(graph.spies.sourceCommand).toHaveBeenCalledWith({ action: "resolveProfile", handle: "jack" }, "x-account");
    await expect(mounted.rpc("sync.selection", { sourceId: "x", accountId: "x-account", accountGeneration: 1 })).rejects.toThrow("migration");
  });
});

/** @test-id: tst_module_x_sync_002
 * @scenario: scn_x_sync_001
 * @covers: XModule.onConnectionReady, resolveSyncMigration, syncSelection
 * @deterministic: yes
 * @fixtures: durable Graph maps shared by fresh module instances and real Contacts cleanup
 */
describe("X restartable migration", () => {
  async function fixture() {
    const contacts = [true, false].map((enabled, index) => entity(`contact-${index}`, "jack", {
      schemaId: "contacts.person", properties: { tracking: [{ platform: "x", handle: "jack", enabled }, { platform: "linkedin", handle: "jack", enabled: true }] },
    }));
    const rows = new Map<string, SyncMigrationEntity>();
    const externalIds = new Map<string, PersistentEntityId>();
    const links: Link[] = [];
    const faults = { lookup: false, cleanup: false };
    const raw = (row: SyncMigrationEntity): PersistentEntity & Syncable => {
      if (row.syncEnabled === null || row.syncRevision === null) throw new Error("Uninitialized ordinary profile read");
      const externalId = [...externalIds].find(([, id]) => id === row.id)?.[0];
      if (externalId === undefined) throw new Error("Profile has no external id");
      return { ...entity(row.id, row.name ?? "", { schemaId: row.schemaId,
        source: { source: "test", account: "a1", externalId }, properties: row.properties as JsonObject }),
        syncEnabled: row.syncEnabled, syncRevision: row.syncRevision };
    };
    const graph = mockGraph({
      listEntitiesWindow: async () => page(contacts),
      listSyncMigrationEntities: async () => ({ items: [...rows.values()], next: null }),
      listLinksForEntities: async (ids) => links.filter(item => ids.includes(item.from) || ids.includes(item.to)),
      syncState: syncStateDouble({ status: () => Promise.resolve({ accounts: [{ accountId: "x-account", sync: null }] }) }),
      sourceCommand: async (payload, accountId) => {
        expect(payload).toEqual({ action: "resolveProfile", handle: "jack" });
        expect(accountId).toBe("x-account");
        if (faults.lookup) throw new Error("X lookup unavailable");
        return { providerId: "12", handle: "jack", displayName: "Jack", bio: "Bio", avatarUrl: null };
      },
      findByExternalId: async (externalId) => externalIds.get(externalId) ?? null,
      findByExternalIds: async (items) => items.map(externalId => externalIds.get(externalId) ?? null),
      getEntities: async (ids, opts) => ids.map(id => {
        const row = rows.get(id);
        if (row === undefined) throw new Error("Missing profile");
        const read = storedRead(raw(row));
        return opts?.extras ? read : read.entity;
      }),
      getEntity: async (id, opts) => { const row = rows.get(id); if (row === undefined) return contacts.find(item => item.id === id) ?? null; const read = storedRead(raw(row)); return opts?.extras ? read : read.entity; },
      updateEntityName: async (id, name) => { const contact = contacts.find(item => item.id === id); if (contact === undefined) throw new Error("Missing contact"); contact.name = name; },
      getEntityFull: async (id) => {
        const contact = contacts.find(item => item.id === id);
        return contact === undefined ? null : { entity: contact, links: links.filter(item => item.from === id) };
      },
      updateProperties: async (params) => {
        const contact = contacts.find(item => item.id === params.entityId);
        if (contact === undefined) throw new Error("Missing contact");
        contact.properties = { ...(contact.properties as JsonObject), ...(params.properties as JsonObject) };
      },
      updateEntitySyncEnabled: async (params) => {
        const row = rows.get(params.id);
        if (row === undefined) throw new Error("Missing profile");
        if (row.syncRevision === null) row.syncRevision = "0";
        else if (row.syncEnabled !== params.syncEnabled) row.syncRevision = String(BigInt(row.syncRevision) + 1n);
        row.syncEnabled = params.syncEnabled;
        return { syncRevision: row.syncRevision };
      },
      applyBatch: async (batch) => {
        const ids: Record<string, PersistentEntityId> = {};
        for (const item of batch.entities) {
          if (item.schemaId !== "x.profile" || item.externalId === null || item.properties === null
            || !("syncEnabled" in item) || typeof item.syncEnabled !== "boolean") throw new Error("Invalid migration create");
          const id = externalIds.get(item.externalId) ?? entityId(`profile-${rows.size}`);
          externalIds.set(item.externalId, id);
          if (!rows.has(id)) rows.set(id, { id, schemaId: "x.profile", name: item.name, indexed: false, isPinned: null,
            properties: item.properties as JsonObject, syncEnabled: item.syncEnabled, syncRevision: "0" });
          ids[item.key] = id;
        }
        return { ids, created: batch.entities.length, updated: 0, linksAdded: 0, droppedKeys: [], resolved: [] };
      },
      addLink: async (input) => {
        if (!links.some(item => item.from === input.from && item.to === input.to && item.kind === input.kind)) links.push(link(input.from, input.to, input.kind, { id: `link-${links.length}` }));
      },
    });
    const owner = await mountModule(ContactsModule, { mode: "dispatch", graph, ctx: { extensionId: "contacts" } });
    const execute = async (method: string, params?: unknown) => {
      if (faults.cleanup) { faults.cleanup = false; throw new Error("Cleanup interrupted"); }
      // The X module calls through RpcExecutor; the mounted Contacts surface takes JSON params.
      return owner.rpc(method, params as JsonValue);
    };
    return { graph, contacts, rows, links, faults, fresh: () => mountX(graph, execute) };
  }

  it("an explicit conflict choice survives interruption and restart without duplicate profiles or links", async () => {
    const f = await fixture();
    // The host reads no answer from the hook; the migration status says the conflict is open.
    await f.fresh().onConnectionReady(ready);
    expect(await f.fresh().syncMigration()).toMatchObject({ complete: false });
    expect(f.rows.size).toBe(0);
    f.faults.cleanup = true;
    expect(await f.fresh().resolveSyncMigration({ target: { schemaId: "x.profile", key: "x:profile:12" }, syncEnabled: true }))
      .toMatchObject({ complete: false, issues: [{ message: "Cleanup interrupted" }] });
    expect(f.rows.size).toBe(1);
    expect(f.links).toHaveLength(2);
    expect(f.contacts.every(contact => { const tracking = trackingOf(contact); return Array.isArray(tracking) && tracking.length === 2; })).toBe(true);
    f.faults.lookup = true;
    const lookupCount = f.graph.spies.sourceCommand?.mock.calls.length;
    const next = f.fresh();
    await next.onConnectionReady(ready);
    expect(f.graph.spies.sourceCommand).toHaveBeenCalledTimes(lookupCount!);
    expect(await next.syncMigration()).toEqual({ complete: true, issues: [] });
    expect(f.rows.size).toBe(1);
    expect(f.links).toHaveLength(2);
    for (const contact of f.contacts) expect(trackingOf(contact)).toEqual([{ platform: "linkedin", handle: "jack", enabled: true }]);
    expect(await next.syncSelection({ sourceId: "x", accountId: "x-account", accountGeneration: 1 })).toEqual({ surface: "x", choices: [
      { id: entityId("profile-0"), scopeId: "12", handle: "jack", syncEnabled: true, syncRevision: "0" },
    ] });
    expect(f.rows.get(entityId("profile-0"))?.indexed).toBe(false);
    const first = await next.setSyncEnabled({ id: entityId("profile-0"), syncEnabled: false });
    expect(await next.setSyncEnabled({ id: entityId("profile-0"), syncEnabled: false })).toEqual(first);
    expect(first.results).toMatchObject([{ kind: "saved", syncEnabled: false, syncRevision: "1" }]);
  });

  it("lookup failure keeps legacy records and never starts content acquisition", async () => {
    const f = await fixture();
    f.faults.lookup = true;
    await f.fresh().onConnectionReady(ready);
    expect(await f.fresh().syncMigration()).toMatchObject({ complete: false });
    expect(f.rows.size).toBe(0);
    expect(f.links).toEqual([]);
    expect(f.graph.spies.updateProperties).not.toHaveBeenCalled();
    await expect(f.fresh().syncSelection({ sourceId: "x", accountId: "x-account", accountGeneration: 1 })).rejects.toThrow("migration");
  });
});

/** @test-id: tst_module_x_sync_003
 * @scenario: scn_x_sync_001
 * @covers: XModule.ingest
 * @deterministic: yes
 * @fixtures: enabled and stopped profiles; profile metadata, posts and id-only deletions
 */
it("admits X updates and deletions only for the saved profile choice", async () => {
  const profiles = [
    profileEntity("profile-a", "Jack", "x:profile:12", { handle: "jack" }, true, "1"),
    profileEntity("profile-b", "Ann", "x:profile:99", { handle: "ann" }, false, "2"),
  ];
  const ids = new Map([["x:profile:12", entityId("profile-a")], ["x:profile:99", entityId("profile-b")], ["x:post:old-a", entityId("old-a")], ["x:post:old-b", entityId("old-b")]]);
  const graph = mockGraph({
    findByExternalIds: async (externalIds) => externalIds.map(externalId => ids.get(externalId) ?? null),
    findByExternalId: async (externalId) => ids.get(externalId) ?? null,
    getEntities: async (wanted, opts) => profiles.filter(row => wanted.includes(row.id)).map(row => opts?.extras ? storedRead(row) : storedRead(row).entity),
    getEntity: async (id, opts) => { const row = profiles.find(row => row.id === id); return row === undefined ? null : opts?.extras ? storedRead(row) : storedRead(row).entity; },
    getEntityFull: async (id) => ({ entity: entity(id, "Old", { schemaId: "x.post" }), links: [
      link(id, id === entityId("old-a") ? "profile-a" : "profile-b", "authored_by", { id: `link-${id}` }),
    ] }),
    admitSyncEntities: async (subjects) => subjects.flatMap(subject => profiles.find(row => row.id === subject.entityId)?.syncEnabled ? [...subject.remoteIds] : []),
    applyBatch: async () => ({ ids: {}, created: 0, updated: 0, linksAdded: 0, droppedKeys: [], resolved: [] }),
    deleteEntity: async () => undefined,
  });
  const mod = mountX(graph);
  await mod.ingest({ envelopes: [
    env("x:profile:12", { entity_type: "profile", handle: "jack", display_name: "Updated Jack", platform: "x" }),
    env("x:profile:99", { entity_type: "profile", handle: "ann", display_name: "Stopped Ann", platform: "x" }),
    env("x:post:new-a", { entity_type: "post", author_handle: "jack", text: "Allowed", platform: "x" }),
    env("x:post:new-b", { entity_type: "post", author_handle: "ann", text: "Stopped", platform: "x" }),
    { ...env("x:post:old-a", {}), kind: "delete" }, { ...env("x:post:old-b", {}), kind: "delete" },
  ] });
  const batch = graph.spies.applyBatch?.mock.calls[0]?.[0] as GraphBatchInput;
  expect(batch.entities.map(item => item.externalId)).toEqual(["x:profile:12", "x:post:new-a"]);
  expect(graph.spies.deleteEntity).toHaveBeenCalledExactlyOnceWith(entityId("old-a"));
  expect(graph.spies.admitSyncEntities).toHaveBeenCalledTimes(1);
});

/** @test-id: tst_module_x_sync_004
 * @scenario: scn_x_sync_001
 * @covers: XModule.ingest discovery
 * @deterministic: yes
 * @fixtures: explicit disabled creation rule, changed rule and repeated discovery
 */
it("creates a minimal selectable profile under its explicit rule without admitting posts or resetting Stop", async () => {
  let stored: PersistentEntity & Syncable | undefined;
  let storedExternalId: string | null = null;
  let rule = "false";
  const graph = mockGraph({
    findByExternalIds: async (externalIds) => externalIds.map(externalId => stored !== undefined && storedExternalId === externalId ? stored.id : null),
    getEntities: async (_ids, opts) => stored === undefined ? [] : [opts?.extras ? storedRead(stored) : storedRead(stored).entity],
    listSyncMigrationEntities: async () => ({ items: [], next: null }),
    listEntitiesWindow: async () => page([]),
    moduleSettings: async () => ({ newProfileSyncEnabled: rule }),
    admitSyncEntities: async () => [],
    applyBatch: async (batch) => {
      const profile = batch.entities[0];
      if (profile === undefined || !("syncEnabled" in profile) || profile.syncEnabled !== false
        || profile.externalId === null || profile.properties === null) throw new Error("Expected disabled profile discovery");
      storedExternalId = profile.externalId;
      stored = profileEntity("new-profile", profile.name ?? "", profile.externalId, profile.properties as JsonObject, false, "0");
      return { ids: { "x:profile:12": entityId("new-profile") }, created: 1, updated: 0, linksAdded: 0, droppedKeys: [], resolved: [] };
    },
  });
  const envelopes = [env("x:profile:12", { entity_type: "profile", platform: "x", handle: "jack", bio: "Bio", posts_total: 10 }),
    env("x:post:1", { entity_type: "post", platform: "x", author_handle: "jack", text: "Do not store" })];
  await mountX(graph).ingest({ envelopes });
  expect(stored?.properties).toMatchObject({ handle: "jack", bio: "Bio" });
  expect(stored?.properties).not.toHaveProperty("posts_total");
  expect(graph.spies.applyBatch).toHaveBeenCalledTimes(1);
  rule = "true";
  await mountX(graph).ingest({ envelopes: envelopes.map(item => ({ ...item, payload: { ...(item.payload as JsonObject), bio: "Do not refresh" } })) });
  expect(graph.spies.applyBatch).toHaveBeenCalledTimes(1);
  expect((stored?.properties as JsonObject | undefined)?.bio).toBe("Bio");
});
