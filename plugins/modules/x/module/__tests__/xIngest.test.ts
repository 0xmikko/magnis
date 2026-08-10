// tst_plugin_x_ingest — sync ingest builds an idempotent apply_batch
// (profiles + posts + authored_by link, each node anchored on its remote id)
// and read tools map window rows. Doubles come from @magnis/testkit/module (throwing mockGraph
// — a read/ingest path hitting an unarranged op fails loudly).
import { describe, expect, it, vi } from "vitest";
import type { GraphBatchInput } from "@magnis/plugin-sdk";
import { entity, mockGraph, mountModule, windowRow, type MockGraph } from "@magnis/testkit/module";
import { XModule } from "../service.ts";
import type { SyncEnvelope, XCanonical } from "../../types.ts";

type G = MockGraph<XCanonical>;

function mountX(graph: G, execute: (method: string, params?: unknown) => unknown = vi.fn()): XModule {
  return mountModule<XModule, XCanonical>(XModule, {
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
  return mockGraph<XCanonical>({
    apply_batch: () =>
      Promise.resolve({ ids: {}, created: 0, updated: 0, links_added: 0, dropped_keys: [] }),
    list_entities_window: () => Promise.resolve({ items: [], total: 0 }),
    get_entity_full: () => Promise.resolve(null),
  });
}

describe("x ingest", () => {
  it("tst_plugin_x_ingest_001 builds one apply_batch with profile+post+link, each node anchored", async () => {
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

    expect(res.ok).toBe(true);
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
    expect(profile.anchor).toBe("x:profile:jack");
    expect(profile.properties).toMatchObject({ handle: "jack", follower_count: 100 });
    expect(post.anchor).toBe("x:post:1");
    // content AND metrics in ONE dictionary.
    expect(post.properties).toMatchObject({ text: "hello world", metrics: { likes: 5 } });
    // authored_by link wired within the page (author_handle "Jack" → profile "jack").
    expect(batch.links).toEqual([
      {
        from_key: "x:post:1",
        to_key: "x:profile:jack",
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
describe("x ingest identity link (tst_ingest_link)", () => {
  function linkGraph(): G {
    return mockGraph<XCanonical>({
      apply_batch: () =>
        Promise.resolve({
          ids: { "x:profile:12": "prof-1" },
          created: 1,
          updated: 0,
          links_added: 0,
          dropped_keys: [],
        }),
      add_link: () => Promise.resolve(),
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

    expect(graph.spies.add_link).toHaveBeenCalledTimes(1);
    // `identity` runs hub → channel: the contact is the FROM endpoint.
    expect(graph.spies.add_link).toHaveBeenCalledWith({
      from_id: "c1",
      to_id: "prof-1",
      kind: "identity",
      declared_by: "x:profile:12",
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
    expect(graph.spies.add_link).not.toHaveBeenCalled();
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
    expect(res.ok).toBe(true);
    expect(graph.spies.add_link).not.toHaveBeenCalled();
  });
});

// tst_profiles_search (live bug 2026-07-03): the framework list pane passes
// `search` into profiles.list; the tool must accept it (schema) and filter by
// name — previously additionalProperties:false rejected the call and the
// standard search box silently did nothing on this module.
describe("x profiles.list search", () => {
  it("search → search_entities_by_name, dictionaries ride the rows, BACKEND order preserved", async () => {
    const graph = mockGraph<XCanonical>({
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
    return mockGraph<XCanonical>({
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
