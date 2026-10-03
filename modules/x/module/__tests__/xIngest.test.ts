// tst_plugin_x_ingest — sync ingest builds an idempotent apply_batch
// (profiles + posts + authored_by link, each node anchored on its remote id)
// and read tools map window rows. Doubles come from @magnis/testkit/module (throwing mockGraph
// — a read/ingest path hitting an unarranged op fails loudly).
import { describe, expect, it, vi } from "vitest";
import type { GraphBatchInput, LinkSummary, RawEntity, SyncMigrationEntity } from "@magnis/plugin-sdk";
import { entity, mockGraph, mountModule, windowRow, type MockGraph } from "@magnis/testkit/module";
import { ContactsModule } from "../../../contacts/module/service.ts";
import { XModule } from "../service.ts";
import type { SyncEnvelope, XCanonical } from "../../types.ts";

type G = MockGraph;

function mountX(graph: G, execute: (method: string, params?: unknown) => unknown = vi.fn()): XModule {
  return mountModule<XModule>(XModule, {
    graph,
    ctx: { extension_id: "x" },
    rpc: { execute },
  }).module;
}

function env(remote_id: string, payload: Record<string, unknown>): SyncEnvelope {
  return {
    source_id: "x",
    surface: "x",
    account_id: "a1",
    user_id: "u1",
    kind: "snapshot",
    remote_id,
    payload,
    timestamp: "2026-06-26T00:00:00Z",
  };
}

function ingestGraph(): G {
  const profile = { ...entity("profile-12", "Jack", { schema_id: "x.profile", anchor: "x:profile:12", properties: { handle: "jack" } }), syncEnabled: true, syncRevision: "0" };
  return mockGraph({
    find_by_anchors: async (anchors) => anchors.map(anchor => anchor === "x:profile:12" ? profile.id : null),
    get_entities: async (ids) => ids.includes(profile.id) ? [profile] : [],
    get_entity: async (id) => id === profile.id ? profile : null,
    listSyncMigrationEntities: async () => ({ items: [{ id: profile.id, schemaId: "x.profile", name: "Jack", indexed: true, isPinned: null, properties: { handle: "jack" }, syncEnabled: true, syncRevision: "0" }], next: null }),
    admitSyncEntities: async (subjects) => subjects.flatMap(subject => [...subject.remoteIds]),
    apply_batch: async () => ({ ids: {}, created: 0, updated: 0, links_added: 0, dropped_keys: [] }),
    list_entities_window: async () => ({ items: [], total: 0 }),
    get_entity_full: async () => null,
  });
}

describe("x ingest", () => {
  it("tst_plugin_x_ingest_001 builds one apply_batch with profile+post+link, each node anchored", async () => {
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

    expect(res).toEqual({ dropped_remote_ids: [], trigger_checks: [] });
    const applyBatch = graph.spies.apply_batch;
    if (applyBatch === undefined) throw new Error("x ingest 001: missing apply_batch spy");
    expect(applyBatch).toHaveBeenCalledTimes(1);
    const batchCall = applyBatch.mock.calls[0];
    if (batchCall === undefined) throw new Error("x ingest 001: no apply_batch call recorded");
    const batch = batchCall[0] as GraphBatchInput;
    expect(batch.entities).toHaveLength(2);

    const profile = batch.entities.find((e) => e.schema_id === "x.profile")!;
    const post = batch.entities.find((e) => e.schema_id === "x.post")!;
    // The dictionary IS the record; X renames handles, never account ids, so
    // the remote id is the anchor.
    expect(profile.anchor).toBe("x:profile:12");
    expect(profile.properties).toMatchObject({ handle: "jack", follower_count: 100 });
    expect(post.anchor).toBe("x:post:1");
    // content AND metrics in ONE dictionary.
    expect(post.properties).toMatchObject({ text: "hello world", metrics: { likes: 5 } });
    // authored_by link wired within the page (author_handle "Jack" → profile "jack").
    expect(batch.links).toEqual([
      {
        from_key: "x:post:1",
        to_key: "x:profile:12",
        kind: "authored_by",
        declared_by: "x:post:1",
      },
    ]);
  });

  it("tst_plugin_x_ingest_002 re-ingest keeps the same anchor (idempotent)", async () => {
    const graph = ingestGraph();
    const mod = mountX(graph);
    const e = env("x:post:1", {
      entity_type: "post",
      platform: "x",
      post_id: "1",
      author_handle: "jack",
      text: "v1",
    });

    await mod.ingest({ envelopes: [e] });
    await mod.ingest({ envelopes: [{ ...e, payload: { ...e.payload, text: "v2" } }] });

    const applyBatch = graph.spies.apply_batch;
    if (applyBatch === undefined) throw new Error("x ingest 002: missing apply_batch spy");
    const firstCall = applyBatch.mock.calls[0];
    const secondCall = applyBatch.mock.calls[1];
    if (firstCall === undefined || secondCall === undefined) throw new Error("x ingest 002: missing apply_batch call");
    const firstEntity = (firstCall[0] as GraphBatchInput).entities[0];
    const secondEntity = (secondCall[0] as GraphBatchInput).entities[0];
    if (firstEntity === undefined || secondEntity === undefined) throw new Error("x ingest 002: missing batch entity");
    expect(firstEntity.anchor).toBe("x:post:1");
    expect(secondEntity.anchor).toBe("x:post:1"); // same anchor → upsert, no duplicate
  });

  it("tst_plugin_x_ingest_003 posts.list maps window rows", async () => {
    const graph = ingestGraph();
    const mod = mountX(graph);
    const listWindow = graph.spies.list_entities_window;
    if (listWindow === undefined) throw new Error("x ingest 003: missing list_entities_window spy");
    listWindow.mockResolvedValue({
      items: [
        windowRow(
          entity("p1", "hello", {
            schema_id: "x.post",
            properties: {
              platform: "x",
              author_handle: "jack",
              text: "hello",
              created_at: "t",
              url: null,
            },
          }),
        ),
      ],
      total: 1,
    });

    const page = await mod.postsList({});
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ id: "p1", platform: "x", author_handle: "jack", text: "hello" });
    expect(graph.spies.list_entities_window).toHaveBeenCalledTimes(1);
  });
});

// tst_ingest_link:
// a tracked-handle profile gets exactly one person→profile identity edge and
// the placeholder-name CAS upgrade; an untracked handle gets neither.
/**
 * @test-id: tst_plugin_x_plan_001
 * @scenario: scn_x_sync_001
 * @covers: XModule.ingest (plan)
 * @deterministic: yes
 * @fixtures: a profile envelope with a planned window of 10; two posts, one already in the graph
 */
describe("x ingest — the plan from the pages", () => {
  const profile = (over: Record<string, unknown> = {}): SyncEnvelope => env("x:profile:12", {
    entity_type: "profile", platform: "x", handle: "jack", display_name: "Jack", posts_total: 10, posts_skipped: 1190, ...over,
  });
  const post = (id: string): SyncEnvelope => ({ ...env(`x:post:${id}`, { entity_type: "post", platform: "x", post_id: id, author_handle: "jack", text: `post ${id}`, created_at: "2026-06-01T00:00:00Z", metrics: {} }), kind: "live" });
  function planGraph(known: Record<string, Record<string, unknown>>): G {
    return mockGraph({
      admitSyncEntities: async (subjects) => subjects.flatMap(subject => [...subject.remoteIds]),
      find_by_anchors: (anchors: string[]) => Promise.resolve(anchors.map((anchor) => (anchor === "x:profile:12" || anchor in known ? `id:${anchor}` : null))),
      get_entities: (ids: string[]) => Promise.resolve(ids.map((id) => ({ ...entity(id, "", { schema_id: "x.profile", anchor: "x:profile:12" }), properties: known[id.slice("id:".length)] ?? { handle: "jack" }, syncEnabled: true, syncRevision: "0" }))),
      apply_batch: () => Promise.resolve({ ids: {}, created: 0, updated: 0, links_added: 0, dropped_keys: [] }),
    });
  }

  it("states profiles and the posts window on a new pass, stamps the pass, and one per new post afterwards", async () => {
    // The profile is unknown: a new pass.
    const fresh = planGraph({});
    const first = await mountX(fresh).ingest({ generation: "initial:r:1", envelopes: [profile(), post("1"), post("2")] });
    expect(first).toEqual({ dropped_remote_ids: [], trigger_checks: [], plan: { "x.profile": { total: 1, skipped: 0 }, "x.post": { total: 10, skipped: 1190 } } });
    const batch = fresh.spies.apply_batch?.mock.calls[0]?.[0] as GraphBatchInput;
    expect(batch.entities.find((item) => item.schema_id === "x.profile")?.properties).toMatchObject({ handle: "jack", sync_pass: "initial:r:1" });

    // The same pass, a later poll: the profile is stamped; post 1 is known, post 3 is new.
    const stamped = planGraph({ "x:profile:12": { handle: "jack", sync_pass: "initial:r:1" }, "x:post:1": {} });
    const later = await mountX(stamped).ingest({ generation: "initial:r:1", envelopes: [profile(), post("1"), post("3")] });
    expect(later.plan).toEqual({ "x.profile": { total: 0, skipped: 0 }, "x.post": { total: 1, skipped: 0 } });

    // A new pass states the profile and its window in full again.
    const next = await mountX(stamped).ingest({ generation: "initial:r:2", envelopes: [profile(), post("1")] });
    expect(next.plan).toEqual({ "x.profile": { total: 1, skipped: 0 }, "x.post": { total: 10, skipped: 1190 } });

    // Outside a worker's pass nothing is read and nothing is stated.
    const outside = await mountX(ingestGraph()).ingest({ envelopes: [profile(), post("1")] });
    expect(outside).toEqual({ dropped_remote_ids: [], trigger_checks: [] });
  });
});

// Legacy contact links and placeholder names are migrated before acquisition.
// The restartable migration tests below exercise that path through Contacts.

// tst_profiles_search (live bug 2026-07-03): the framework list pane passes
// `search` into profiles.list; the tool must accept it (schema) and filter by
// name — previously additionalProperties:false rejected the call and the
// standard search box silently did nothing on this module.
describe("x profiles.list search", () => {
  it("search → search_entities_by_name, dictionaries ride the rows, BACKEND order preserved", async () => {
    const graph = mockGraph({
      search_entities_by_name: () =>
        Promise.resolve([
          entity("e2", "Bob Builder", {
            schema_id: "x.profile",
            properties: { handle: "bob", follower_count: 7, avatar_url: null },
          }),
          entity("e1", "Ann Doe", {
            schema_id: "x.profile",
            properties: { handle: "ann", follower_count: 5, avatar_url: "https://a/1.jpg" },
          }),
        ]),
    });
    const mod = mountX(graph);

    const r = await mod.profilesList({ search: "o", limit: 10 });
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledWith(
      expect.objectContaining({ query: "o", schema_ids: ["x.profile"] }),
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
      search_entities_by_name: (p) =>
        Promise.resolve(dataset.slice(0, p.limit).map((d) => entity(d.id, d.name, { schema_id: "x.profile" }))),
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
      schema_id: "contacts.person", properties: { tracking: [{ platform: "x", handle: index === 0 ? "Jack" : "jack", enabled }] },
    }));
    const graph = mockGraph({
      list_entities_window: async () => ({ items: contacts.map(entity => ({ entity, data: null })), total: contacts.length }),
      listSyncMigrationEntities: async () => ({ items: [], next: null }),
      list_links_for_entities: async () => [],
      syncState: vi.fn().mockResolvedValue({ accounts: [{ account_id: "x-account" }] }),
      source_command: async () => ({ providerId: "12", handle: "jack", displayName: "Jack", bio: null, avatarUrl: null }),
      find_by_anchor: async () => null,
      find_by_anchors: async (anchors) => anchors.map(() => null),
      get_entities: async () => [],
      apply_batch: async () => { throw new Error("Conflict must not initialize a profile"); },
    });
    const mounted = await mountModule(XModule, { mode: "dispatch", graph, ctx: { extension_id: "x" } });
    const status = await mounted.rpc("x.profile.syncMigration", {});
    expect(status).toMatchObject({ complete: false, issues: [{
      target: { schemaId: "x.profile", key: "x:profile:12" }, legacyIds: ["contact-0", "contact-1"],
    }] });
    expect(graph.spies.apply_batch).not.toHaveBeenCalled();
    expect(graph.spies.source_command).toHaveBeenCalledWith({ action: "resolveProfile", handle: "jack" }, "x-account");
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
      schema_id: "contacts.person", properties: { tracking: [{ platform: "x", handle: "jack", enabled }, { platform: "linkedin", handle: "jack", enabled: true }] },
    }));
    const rows = new Map<string, SyncMigrationEntity>();
    const anchors = new Map<string, string>();
    const links: LinkSummary[] = [];
    const faults = { lookup: false, cleanup: false };
    const raw = (row: SyncMigrationEntity): RawEntity => {
      if (row.syncEnabled === null || row.syncRevision === null) throw new Error("Uninitialized ordinary profile read");
      return { id: row.id, schema_id: row.schemaId, name: row.name ?? "", indexed: row.indexed,
        anchor: [...anchors].find(([, id]) => id === row.id)?.[0], properties: row.properties,
        ...{ syncEnabled: row.syncEnabled, syncRevision: row.syncRevision } };
    };
    const graph = mockGraph({
      list_entities_window: async () => ({ items: contacts.map(entity => ({ entity, data: null })), total: contacts.length }),
      listSyncMigrationEntities: async () => ({ items: [...rows.values()], next: null }),
      list_links_for_entities: async (ids) => links.filter(link => ids.includes(link.from_id) || ids.includes(link.to_id)),
      syncState: vi.fn().mockResolvedValue({ accounts: [{ account_id: "x-account" }] }),
      source_command: async (payload, accountId) => {
        expect(payload).toEqual({ action: "resolveProfile", handle: "jack" });
        expect(accountId).toBe("x-account");
        if (faults.lookup) throw new Error("X lookup unavailable");
        return { providerId: "12", handle: "jack", displayName: "Jack", bio: "Bio", avatarUrl: null };
      },
      find_by_anchor: async (anchor) => anchors.get(anchor) ?? null,
      find_by_anchors: async (items) => items.map(anchor => anchors.get(anchor) ?? null),
      get_entities: async (ids) => ids.map(id => {
        const row = rows.get(id);
        if (row === undefined) throw new Error("Missing profile");
        return raw(row);
      }),
      get_entity: async (id) => { const row = rows.get(id); return row === undefined ? contacts.find(item => item.id === id) ?? null : raw(row); },
      update_entity_name: async (id, name) => { const contact = contacts.find(item => item.id === id); if (contact === undefined) throw new Error("Missing contact"); contact.name = name; },
      get_entity_full: async (id) => {
        const contact = contacts.find(item => item.id === id);
        return contact === undefined ? null : { entity: contact, links: links.filter(link => link.from_id === id) };
      },
      update_properties: async (params) => {
        const contact = contacts.find(item => item.id === params.entity_id);
        if (contact === undefined) throw new Error("Missing contact");
        contact.properties = { ...contact.properties, ...params.properties };
      },
      updateEntitySyncEnabled: async (params) => {
        const row = rows.get(params.id);
        if (row === undefined) throw new Error("Missing profile");
        if (row.syncRevision === null) row.syncRevision = "0";
        else if (row.syncEnabled !== params.syncEnabled) row.syncRevision = String(BigInt(row.syncRevision) + 1n);
        row.syncEnabled = params.syncEnabled;
        return { syncRevision: row.syncRevision };
      },
      apply_batch: async (batch) => {
        const ids: Record<string, string> = {};
        for (const item of batch.entities) {
          if (item.schema_id !== "x.profile" || item.anchor === undefined || typeof item.syncEnabled !== "boolean") throw new Error("Invalid migration create");
          const id = anchors.get(item.anchor) ?? `profile-${rows.size}`;
          anchors.set(item.anchor, id);
          if (!rows.has(id)) rows.set(id, { id, schemaId: "x.profile", name: item.name ?? "", indexed: false, isPinned: null,
            properties: item.properties ?? {}, syncEnabled: item.syncEnabled, syncRevision: "0" });
          ids[item.key] = id;
        }
        return { ids, created: batch.entities.length, updated: 0, links_added: 0, dropped_keys: [] };
      },
      add_link: async (input) => {
        if (!links.some(link => link.from_id === input.from_id && link.to_id === input.to_id && link.kind === input.kind)) links.push({ ...input, id: `link-${links.length}`, validUntil: null, metadata: {} });
      },
    });
    const owner = await mountModule(ContactsModule, { mode: "dispatch", graph, ctx: { extension_id: "contacts" } });
    const execute = async (method: string, params?: unknown) => {
      if (faults.cleanup) { faults.cleanup = false; throw new Error("Cleanup interrupted"); }
      return owner.rpc(method, params);
    };
    return { graph, contacts, rows, links, faults, fresh: () => mountX(graph, execute) };
  }

  it("an explicit conflict choice survives interruption and restart without duplicate profiles or links", async () => {
    const f = await fixture();
    expect(await f.fresh().onConnectionReady({ account_id: "x-account" })).toEqual({ ok: false });
    expect(f.rows.size).toBe(0);
    f.faults.cleanup = true;
    expect(await f.fresh().resolveSyncMigration({ target: { schemaId: "x.profile", key: "x:profile:12" }, syncEnabled: true }))
      .toMatchObject({ complete: false, issues: [{ message: "Cleanup interrupted" }] });
    expect(f.rows.size).toBe(1);
    expect(f.links).toHaveLength(2);
    expect(f.contacts.every(contact => Array.isArray(contact.properties?.tracking) && contact.properties.tracking.length === 2)).toBe(true);
    f.faults.lookup = true;
    const lookupCount = f.graph.spies.source_command?.mock.calls.length;
    const next = f.fresh();
    expect(await next.onConnectionReady({ account_id: "x-account" })).toEqual({ ok: true });
    expect(f.graph.spies.source_command).toHaveBeenCalledTimes(lookupCount!);
    expect(f.rows.size).toBe(1);
    expect(f.links).toHaveLength(2);
    for (const contact of f.contacts) expect(contact.properties?.tracking).toEqual([{ platform: "linkedin", handle: "jack", enabled: true }]);
    expect(await next.syncSelection({ sourceId: "x", accountId: "x-account", accountGeneration: 1 })).toEqual({ surface: "x", choices: [
      { id: "profile-0", scopeId: "12", handle: "jack", syncEnabled: true, syncRevision: "0" },
    ] });
    expect(f.rows.get("profile-0")?.indexed).toBe(false);
    const first = await next.setSyncEnabled({ id: "profile-0", syncEnabled: false });
    expect(await next.setSyncEnabled({ id: "profile-0", syncEnabled: false })).toEqual(first);
    expect(first.results).toMatchObject([{ kind: "saved", syncEnabled: false, syncRevision: "1" }]);
  });

  it("lookup failure keeps legacy records and never starts content acquisition", async () => {
    const f = await fixture();
    f.faults.lookup = true;
    expect(await f.fresh().onConnectionReady({ account_id: "x-account" })).toEqual({ ok: false });
    expect(f.rows.size).toBe(0);
    expect(f.links).toEqual([]);
    expect(f.graph.spies.update_properties).not.toHaveBeenCalled();
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
    { ...entity("profile-a", "Jack", { schema_id: "x.profile", anchor: "x:profile:12", properties: { handle: "jack" } }), syncEnabled: true, syncRevision: "1" },
    { ...entity("profile-b", "Ann", { schema_id: "x.profile", anchor: "x:profile:99", properties: { handle: "ann" } }), syncEnabled: false, syncRevision: "2" },
  ];
  const ids = new Map([["x:profile:12", "profile-a"], ["x:profile:99", "profile-b"], ["x:post:old-a", "old-a"], ["x:post:old-b", "old-b"]]);
  const graph = mockGraph({
    find_by_anchors: async (anchors) => anchors.map(anchor => ids.get(anchor) ?? null),
    find_by_anchor: async (anchor) => ids.get(anchor) ?? null,
    get_entities: async (wanted) => profiles.filter(row => wanted.includes(row.id)),
    get_entity: async (id) => profiles.find(row => row.id === id) ?? null,
    get_entity_full: async (id) => ({ entity: entity(id, "Old", { schema_id: "x.post" }), links: [
      { id: `link-${id}`, from_id: id, to_id: id === "old-a" ? "profile-a" : "profile-b", kind: "authored_by", validUntil: null, metadata: {} },
    ] }),
    admitSyncEntities: async (subjects) => subjects.flatMap(subject => profiles.find(row => row.id === subject.entityId)?.syncEnabled ? [...subject.remoteIds] : []),
    apply_batch: async () => ({ ids: {}, created: 0, updated: 0, links_added: 0, dropped_keys: [] }),
    delete_entity: async () => undefined,
  });
  const mod = mountX(graph);
  await mod.ingest({ envelopes: [
    env("x:profile:12", { entity_type: "profile", handle: "jack", display_name: "Updated Jack", platform: "x" }),
    env("x:profile:99", { entity_type: "profile", handle: "ann", display_name: "Stopped Ann", platform: "x" }),
    env("x:post:new-a", { entity_type: "post", author_handle: "jack", text: "Allowed", platform: "x" }),
    env("x:post:new-b", { entity_type: "post", author_handle: "ann", text: "Stopped", platform: "x" }),
    { ...env("x:post:old-a", {}), kind: "delete" }, { ...env("x:post:old-b", {}), kind: "delete" },
  ] });
  const batch = graph.spies.apply_batch?.mock.calls[0]?.[0] as GraphBatchInput;
  expect(batch.entities.map(item => item.anchor)).toEqual(["x:profile:12", "x:post:new-a"]);
  expect(graph.spies.delete_entity).toHaveBeenCalledExactlyOnceWith("old-a");
  expect(graph.spies.admitSyncEntities).toHaveBeenCalledTimes(1);
});

/** @test-id: tst_module_x_sync_004
 * @scenario: scn_x_sync_001
 * @covers: XModule.ingest discovery
 * @deterministic: yes
 * @fixtures: explicit disabled creation rule, changed rule and repeated discovery
 */
it("creates a minimal selectable profile under its explicit rule without admitting posts or resetting Stop", async () => {
  let stored: RawEntity | undefined;
  let rule = "false";
  const graph = mockGraph({
    find_by_anchors: async (anchors) => anchors.map(anchor => stored?.anchor === anchor ? stored.id : null),
    get_entities: async () => stored === undefined ? [] : [stored],
    listSyncMigrationEntities: async () => ({ items: [], next: null }),
    list_entities_window: async () => ({ items: [], total: 0 }),
    moduleSettings: async () => ({ newProfileSyncEnabled: rule }),
    admitSyncEntities: async () => [],
    apply_batch: async (batch) => {
      const profile = batch.entities[0];
      if (profile === undefined || profile.syncEnabled !== false) throw new Error("Expected disabled profile discovery");
      stored = { ...entity("new-profile", profile.name ?? "", { schema_id: "x.profile", anchor: profile.anchor, properties: profile.properties }),
        ...{ syncEnabled: false, syncRevision: "0" } };
      return { ids: { "x:profile:12": "new-profile" }, created: 1, updated: 0, links_added: 0, dropped_keys: [] };
    },
  });
  const page = [env("x:profile:12", { entity_type: "profile", platform: "x", handle: "jack", bio: "Bio", posts_total: 10 }),
    env("x:post:1", { entity_type: "post", platform: "x", author_handle: "jack", text: "Do not store" })];
  await mountX(graph).ingest({ envelopes: page });
  expect(stored?.properties).toMatchObject({ handle: "jack", bio: "Bio" });
  expect(stored?.properties).not.toHaveProperty("posts_total");
  expect(graph.spies.apply_batch).toHaveBeenCalledTimes(1);
  rule = "true";
  await mountX(graph).ingest({ envelopes: page.map(env => ({ ...env, payload: { ...env.payload, bio: "Do not refresh" } })) });
  expect(graph.spies.apply_batch).toHaveBeenCalledTimes(1);
  expect(stored?.properties?.bio).toBe("Bio");
});
