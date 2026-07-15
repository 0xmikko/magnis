// tst_plugin_x_ingest — sync ingest builds an idempotent apply_batch
// (profiles + posts + authored_by link, external_id = remote_id) and read tools
// map window rows. Mocked GraphService — no backend.
import { describe, expect, it, vi } from "vitest";
import type { GraphService, PluginDeps, WindowPage } from "@magnis/plugin-sdk";
import { XModule } from "../service.ts";
import type { XCanonical, XFacets, SyncEnvelope } from "../../types/index.ts";

function makeGraph(): GraphService<XFacets, XCanonical> {
  return {
    apply_batch: vi.fn().mockResolvedValue({
      ids: {},
      created: 0,
      updated: 0,
      links_added: 0,
      dropped_keys: [],
    }),
    list_entities_window: vi.fn(),
    get_entity_full: vi.fn(),
  } as unknown as GraphService<XFacets, XCanonical>;
}

function makeModule(graph: GraphService<XFacets, XCanonical>): XModule {
  const deps = {
    graph,
    ctx: { extension_id: "x", user_id: "u1", extension_kind: "plugin" },
    util: {},
    rpc: { execute: vi.fn() },
  } as unknown as PluginDeps<XFacets, XCanonical>;
  return new XModule(deps);
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

describe("x ingest", () => {
  it("tst_plugin_x_ingest_001 builds one apply_batch with profile+post+link, external_id=remote_id", async () => {
    const graph = makeGraph();
    const mod = makeModule(graph);

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
    expect(vi.mocked(graph.apply_batch)).toHaveBeenCalledTimes(1);
    const batch = vi.mocked(graph.apply_batch).mock.calls[0]![0];
    expect(batch.entities).toHaveLength(2);

    const profile = batch.entities.find((e: { schema_id: string }) => e.schema_id === "x.profile")!;
    const post = batch.entities.find((e: { schema_id: string }) => e.schema_id === "x.post")!;
    expect(profile.facets[0]).toMatchObject({ schema_id: "x.profile.identity", external_id: "x:profile:jack" });
    expect(post.facets[0]).toMatchObject({ schema_id: "x.post.content", external_id: "x:post:1" });
    // authored_by link wired within the page (author_handle "Jack" → profile "jack").
    expect(batch.links).toEqual([
      { from_key: "x:post:1", to_key: "x:profile:jack", kind: "x.post:x.profile" },
    ]);
  });

  it("tst_plugin_x_ingest_002 re-ingest keeps the same external_id (idempotent, INV-4)", async () => {
    const graph = makeGraph();
    const mod = makeModule(graph);
    const e = env("x:post:1", {
      entity_type: "post",
      platform: "x",
      post_id: "1",
      author_handle: "jack",
      text: "v1",
    });

    await mod.ingest({ envelopes: [e] });
    await mod.ingest({ envelopes: [{ ...e, payload: { ...e.payload, text: "v2" } }] });

    const first = vi.mocked(graph.apply_batch).mock.calls[0]![0].entities[0]!.facets[0]!.external_id;
    const second = vi.mocked(graph.apply_batch).mock.calls[1]![0].entities[0]!.facets[0]!.external_id;
    expect(first).toBe("x:post:1");
    expect(second).toBe("x:post:1"); // same id → host upserts, no duplicate entity
  });

  it("tst_plugin_x_ingest_003 posts.list maps window rows", async () => {
    const graph = makeGraph();
    const mod = makeModule(graph);
    vi.mocked(graph.list_entities_window).mockResolvedValue({
      items: [
        {
          entity: { id: "p1", schema_id: "x.post", name: "hello" },
          data: { platform: "x", author_handle: "jack", text: "hello", created_at: "t", url: null },
        },
      ],
      total: 1,
    } as unknown as WindowPage);

    const page = await mod.postsList({});
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ id: "p1", platform: "x", author_handle: "jack", text: "hello" });
    expect(vi.mocked(graph.list_entities_window)).toHaveBeenCalledTimes(1);
  });
});

// tst_ingest_link (social-contact-identity S3, DEC-1/DEC-4, INV-1/INV-7):
// a tracked-handle profile gets exactly one profile→person identity link and
// the placeholder-name CAS upgrade; an untracked handle gets neither.
describe("x ingest identity link (tst_ingest_link)", () => {
  function linkGraph() {
    return {
      apply_batch: vi.fn().mockResolvedValue({
        ids: { "x:profile:12": "prof-1" },
        created: 1,
        updated: 0,
        links_added: 0,
        dropped_keys: [],
      }),
      add_link: vi.fn().mockResolvedValue({ id: "l1" }),
    } as unknown as GraphService<XFacets, XCanonical>;
  }

  const profileEnv = env("x:profile:12", {
    entity_type: "profile",
    platform: "x",
    handle: "jack",
    display_name: "Jack",
  });

  it("tracked handle → one identity link + CAS rename call", async () => {
    const graph = linkGraph();
    const rpcExecute = vi.fn(async (method: string) => {
      if (method === "contacts.get_social_tracking_by_handle") {
        return { contact_id: "c1", tracked: true, handle: "jack" };
      }
      if (method === "contacts.rename_if_placeholder") return { renamed: true };
      throw new Error(`unexpected rpc ${method}`);
    });
    const mod = makeModuleWithRpc(graph, rpcExecute);

    await mod.ingest({ envelopes: [profileEnv] });

    expect(graph.add_link).toHaveBeenCalledTimes(1);
    expect(graph.add_link).toHaveBeenCalledWith({
      from_id: "prof-1",
      to_id: "c1",
      kind: "x.profile:contacts.person",
    });
    expect(rpcExecute).toHaveBeenCalledWith("contacts.rename_if_placeholder", {
      id: "c1",
      expected_name: "jack",
      new_name: "Jack",
    });
  });

  it("untracked handle → no link, no rename", async () => {
    const graph = linkGraph();
    const rpcExecute = vi.fn(async () => null);
    const mod = makeModuleWithRpc(graph, rpcExecute);
    await mod.ingest({ envelopes: [profileEnv] });
    expect(graph.add_link).not.toHaveBeenCalled();
  });

  it("rpc failure never fails the ingest (self-healing next cycle)", async () => {
    const graph = linkGraph();
    const rpcExecute = vi.fn(async () => {
      throw new Error("hub unavailable");
    });
    const mod = makeModuleWithRpc(graph, rpcExecute);
    const res = await mod.ingest({ envelopes: [profileEnv] });
    expect(res.ok).toBe(true);
    expect(graph.add_link).not.toHaveBeenCalled();
  });
});

function makeModuleWithRpc(
  graph: GraphService<XFacets, XCanonical>,
  execute: (method: string, params?: unknown) => Promise<unknown>,
) {
  const deps = {
    graph,
    ctx: { extension_id: "x", user_id: "u1", extension_kind: "plugin" },
    util: {},
    rpc: { execute },
  } as unknown as PluginDeps<XFacets, XCanonical>;
  return new XModule(deps);
}

// tst_profiles_search (live bug 2026-07-03): the framework list pane passes
// `search` into profiles.list; the tool must accept it (schema) and filter by
// name — previously additionalProperties:false rejected the call and the
// standard search box silently did nothing on this module.
describe("x profiles.list search", () => {
  it("search → search_entities_by_name, facets hydrated, BACKEND order preserved", async () => {
    const searchFn = vi.fn(async () => [
      { id: "e2", schema_id: "x.profile", name: "Bob Builder" },
      { id: "e1", schema_id: "x.profile", name: "Ann Doe" },
    ]);
    const graph = {
      search_entities_by_name: searchFn,
      list_facets_for_entities: vi.fn(async () => [
        { entity_id: "e1", id: "f1", schema_id: "x.profile.identity", source: "s", observed_at: "2026-01-02T00:00:00Z", data: { handle: "ann", follower_count: 5, avatar_url: "https://a/1.jpg" } },
        { entity_id: "e2", id: "f2", schema_id: "x.profile.identity", source: "s", observed_at: "2026-01-02T00:00:00Z", data: { handle: "bob", follower_count: 7, avatar_url: null } },
      ]),
    } as unknown as GraphService<XFacets, XCanonical>;
    const mod = makeModuleWithRpc(graph, vi.fn());

    const r = await mod.profilesList({ search: "o", limit: 10 });
    expect(searchFn).toHaveBeenCalledWith(
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
  function pagingGraph(dataset: Array<{ id: string; name: string }>) {
    return {
      search_entities_by_name: vi.fn(async ({ limit }: { limit: number }) =>
        dataset.slice(0, limit).map((d) => ({ ...d, schema_id: "x.profile" })),
      ),
      list_facets_for_entities: vi.fn(async () => []),
    } as unknown as GraphService<XFacets, XCanonical>;
  }
  const dataset = [
    { id: "e1", name: "Ann" },
    { id: "e2", name: "Bob" },
    { id: "e3", name: "Cat" },
  ];

  it("page 1: total exceeds shown rows so hasMore stays true", async () => {
    const mod = makeModuleWithRpc(pagingGraph(dataset), vi.fn());
    const r = await mod.profilesList({ search: "a", limit: 2, offset: 0 });
    expect(r.items).toHaveLength(2);
    expect(r.total).toBeGreaterThan(2); // items.length < total → framework loads more
  });

  it("page 2: returns the tail with an exact total", async () => {
    const mod = makeModuleWithRpc(pagingGraph(dataset), vi.fn());
    const r = await mod.profilesList({ search: "a", limit: 2, offset: 2 });
    expect(r.items.map((i) => i.display_name)).toEqual(["Cat"]);
    expect(r.total).toBe(3);
  });
});
