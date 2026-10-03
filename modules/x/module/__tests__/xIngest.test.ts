// tst_plugin_x_ingest — sync ingest builds an idempotent applyBatch
// (profiles + posts + authored_by link, each node keyed by its remote id as
// its externalId) and read tools map window entities. Doubles come from
// @magnis/testkit/module (throwing mockGraph — a read/ingest path hitting an
// unarranged op fails loudly).
import { describe, expect, it, vi } from "vitest";
import type { GraphBatchInput, JsonObject, SyncEnvelope } from "@magnis/sdk";
import { entity, mockGraph, mountModule, page, type MockGraph } from "@magnis/testkit/module";
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
  return {
    sourceId: "x",
    surface: "x",
    accountId: "a1",
    userId: "u1",
    kind: "snapshot",
    remoteId,
    payload,
    timestamp: "2026-06-26T00:00:00Z",
  };
}

const stated = { droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] };

function ingestGraph(): G {
  return mockGraph({
    applyBatch: () =>
      Promise.resolve({ ids: {}, created: 0, updated: 0, linksAdded: 0, droppedKeys: [] }),
    listEntitiesWindow: () => Promise.resolve(page([])),
    getEntityFull: () => Promise.resolve(null),
  });
}

describe("x ingest", () => {
  it("tst_plugin_x_ingest_001 builds one applyBatch with profile+post+link, each node keyed by its externalId", async () => {
    const graph = ingestGraph();
    const mod = mountX(graph);

    const res = await mod.ingest({
      envelopes: [
        env("x:profile:jack", {
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
    expect(profile.externalId).toBe("x:profile:jack");
    expect(profile.properties).toMatchObject({ handle: "jack", follower_count: 100 });
    expect(post.externalId).toBe("x:post:1");
    // content AND metrics in ONE dictionary.
    expect(post.properties).toMatchObject({ text: "hello world", metrics: { likes: 5 } });
    // authored_by link wired within the page (author_handle "Jack" → profile "jack").
    expect(batch.links).toEqual([
      {
        fromKey: "x:post:1",
        toKey: "x:profile:jack",
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
    expect(listed.items[0]).toMatchObject({ id: "p1", platform: "x", author_handle: "jack", text: "hello" });
    expect(graph.spies.listEntitiesWindow).toHaveBeenCalledTimes(1);
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
  const profile = (over: JsonObject = {}): SyncEnvelope => env("x:profile:12", {
    entity_type: "profile", platform: "x", handle: "jack", display_name: "Jack", posts_total: 10, posts_skipped: 1190, ...over,
  });
  const post = (id: string): SyncEnvelope => ({ ...env(`x:post:${id}`, { entity_type: "post", platform: "x", post_id: id, author_handle: "jack", text: `post ${id}`, created_at: "2026-06-01T00:00:00Z", metrics: {} }), kind: "live" });
  function planGraph(known: Record<string, JsonObject>): G {
    return mockGraph({
      findByExternalIds: (externalIds: string[]) => Promise.resolve(externalIds.map((externalId) => (externalId in known ? `id:${externalId}` : null))),
      getEntities: (ids: string[]) => Promise.resolve(ids.map((id) => entity(id, "", { schemaId: "x.profile", properties: known[id.slice("id:".length)] ?? {} }))),
      applyBatch: () => Promise.resolve({ ids: {}, created: 0, updated: 0, linksAdded: 0, droppedKeys: [] }),
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

describe("x ingest identity link (tst_ingest_link)", () => {
  function linkGraph(): G {
    return mockGraph({
      applyBatch: () =>
        Promise.resolve({
          ids: { "x:profile:12": "prof-1" },
          created: 1,
          updated: 0,
          linksAdded: 0,
          droppedKeys: [],
        }),
      addLink: () => Promise.resolve(),
    });
  }

  const profileEnv = env("x:profile:12", {
    entity_type: "profile",
    platform: "x",
    handle: "jack",
    display_name: "Jack",
  });

  it("tracked handle → one identity link + CAS rename call", async () => {
    const graph = linkGraph();
    const execute = vi.fn(async (method: string) => {
      if (method === "contacts.get_social_tracking_by_handle") {
        return { contact_id: "c1", tracked: true, handle: "jack" };
      }
      if (method === "contacts.rename_if_placeholder") return { renamed: true };
      throw new Error(`unexpected rpc ${method}`);
    });
    const mod = mountX(graph, execute);

    await mod.ingest({ envelopes: [profileEnv] });

    expect(graph.spies.addLink).toHaveBeenCalledTimes(1);
    // `identity` runs hub → channel: the contact is the FROM endpoint.
    expect(graph.spies.addLink).toHaveBeenCalledWith({
      from: "c1",
      to: "prof-1",
      kind: "identity",
    });
    expect(execute).toHaveBeenCalledWith("contacts.rename_if_placeholder", {
      id: "c1",
      expected_name: "jack",
      new_name: "Jack",
    });
  });

  it("untracked handle → no link, no rename", async () => {
    const graph = linkGraph();
    const mod = mountX(graph, vi.fn(async () => null));
    await mod.ingest({ envelopes: [profileEnv] });
    expect(graph.spies.addLink).not.toHaveBeenCalled();
  });

  it("rpc failure never fails the ingest (self-healing next cycle)", async () => {
    const graph = linkGraph();
    const mod = mountX(
      graph,
      vi.fn(async () => {
        throw new Error("hub unavailable");
      }),
    );
    const res = await mod.ingest({ envelopes: [profileEnv] });
    expect(res).toEqual(stated);
    expect(graph.spies.addLink).not.toHaveBeenCalled();
  });
});

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
