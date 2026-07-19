// tst_plugin_linkedin_ingest — sync ingest builds an idempotent apply_batch
// (profiles + posts + authored_by link, external_id = remote_id) and read tools
// map window rows. Mocked GraphService — no backend.
import { describe, expect, it, vi } from "vitest";
import type { GraphService, PluginDeps, WindowPage } from "@magnis/plugin-sdk";
import { LinkedinModule } from "./service.ts";
import type { LinkedinCanonical, LinkedinFacets, SyncEnvelope } from "../types/index.ts";

function makeGraph(): GraphService<LinkedinFacets, LinkedinCanonical> {
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
  } as unknown as GraphService<LinkedinFacets, LinkedinCanonical>;
}

function makeModule(graph: GraphService<LinkedinFacets, LinkedinCanonical>): LinkedinModule {
  const deps = {
    graph,
    ctx: { extension_id: "linkedin", user_id: "u1", extension_kind: "plugin" },
    util: {},
    rpc: { execute: vi.fn() },
  } as unknown as PluginDeps<LinkedinFacets, LinkedinCanonical>;
  return new LinkedinModule(deps);
}

function env(remote_id: string, payload: Record<string, unknown>): SyncEnvelope {
  return {
    source_id: "x",
    surface: "linkedin",
    account_id: "a1",
    user_id: "u1",
    kind: "snapshot",
    remote_id,
    payload,
    timestamp: "2026-06-26T00:00:00Z",
  };
}

describe("linkedin ingest", () => {
  it("tst_plugin_linkedin_ingest_001 builds one apply_batch with profile+post+link, external_id=remote_id", async () => {
    const graph = makeGraph();
    const mod = makeModule(graph);

    const res = await mod.ingest({
      envelopes: [
        env("linkedin:profile:jack", {
          entity_type: "profile",
          platform: "x",
          handle: "jack",
          display_name: "Jack",
          follower_count: 100,
        }),
        env("linkedin:post:1", {
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

    const profile = batch.entities.find((e: { schema_id: string }) => e.schema_id === "linkedin.profile")!;
    const post = batch.entities.find((e: { schema_id: string }) => e.schema_id === "linkedin.post")!;
    expect(profile.facets[0]).toMatchObject({ schema_id: "linkedin.profile.identity", external_id: "linkedin:profile:jack" });
    expect(post.facets[0]).toMatchObject({ schema_id: "linkedin.post.content", external_id: "linkedin:post:1" });
    // authored_by link wired within the page (author_handle "Jack" → profile "jack").
    expect(batch.links).toEqual([
      { from_key: "linkedin:post:1", to_key: "linkedin:profile:jack", kind: "linkedin.post:linkedin.profile" },
    ]);
  });

  it("tst_plugin_linkedin_ingest_002 re-ingest keeps the same external_id (idempotent, INV-4)", async () => {
    const graph = makeGraph();
    const mod = makeModule(graph);
    const e = env("linkedin:post:1", {
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
    expect(first).toBe("linkedin:post:1");
    expect(second).toBe("linkedin:post:1"); // same id → host upserts, no duplicate entity
  });

  it("tst_plugin_linkedin_ingest_003 posts.list maps window rows", async () => {
    const graph = makeGraph();
    const mod = makeModule(graph);
    vi.mocked(graph.list_entities_window).mockResolvedValue({
      items: [
        {
          entity: { id: "p1", schema_id: "linkedin.post", name: "hello" },
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
describe("linkedin ingest identity link (tst_ingest_link)", () => {
  function linkGraph() {
    return {
      apply_batch: vi.fn().mockResolvedValue({
        ids: { "linkedin:profile:12": "prof-1" },
        created: 1,
        updated: 0,
        links_added: 0,
        dropped_keys: [],
      }),
      add_link: vi.fn().mockResolvedValue({ id: "l1" }),
    } as unknown as GraphService<LinkedinFacets, LinkedinCanonical>;
  }

  const profileEnv = env("linkedin:profile:12", {
    entity_type: "profile",
    platform: "linkedin",
    handle: "anndoe",
    display_name: "Ann Doe",
  });

  it("tracked handle → one identity link + CAS rename call", async () => {
    const graph = linkGraph();
    const rpcExecute = vi.fn(async (method: string) => {
      if (method === "contacts.get_social_tracking_by_handle") {
        return { contact_id: "c1", tracked: true, handle: "anndoe" };
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
      kind: "linkedin.profile:contacts.person",
    });
    expect(rpcExecute).toHaveBeenCalledWith("contacts.rename_if_placeholder", {
      id: "c1",
      expected_name: "anndoe",
      new_name: "Ann Doe",
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
  graph: GraphService<LinkedinFacets, LinkedinCanonical>,
  execute: (method: string, params?: unknown) => Promise<unknown>,
) {
  const deps = {
    graph,
    ctx: { extension_id: "linkedin", user_id: "u1", extension_kind: "plugin" },
    util: {},
    rpc: { execute },
  } as unknown as PluginDeps<LinkedinFacets, LinkedinCanonical>;
  return new LinkedinModule(deps);
}

// tst_profiles_search (live bug 2026-07-03): the framework list pane passes
// `search` into profiles.list; the tool must accept it (schema) and filter by
// name — previously additionalProperties:false rejected the call and the
// standard search box silently did nothing on this module.
describe("linkedin profiles.list search", () => {
  it("search → search_entities_by_name, facets hydrated, BACKEND order preserved", async () => {
    const searchFn = vi.fn(async () => [
      { id: "e2", schema_id: "linkedin.profile", name: "Bob Builder" },
      { id: "e1", schema_id: "linkedin.profile", name: "Ann Doe" },
    ]);
    const graph = {
      search_entities_by_name: searchFn,
      list_facets_for_entities: vi.fn(async () => [
        { entity_id: "e1", id: "f1", schema_id: "linkedin.profile.identity", source: "s", observed_at: "2026-01-02T00:00:00Z", data: { handle: "ann", follower_count: 5, avatar_url: "https://a/1.jpg" } },
        { entity_id: "e2", id: "f2", schema_id: "linkedin.profile.identity", source: "s", observed_at: "2026-01-02T00:00:00Z", data: { handle: "bob", follower_count: 7, avatar_url: null } },
      ]),
    } as unknown as GraphService<LinkedinFacets, LinkedinCanonical>;
    const mod = makeModuleWithRpc(graph, vi.fn());

    const r = await mod.profilesList({ search: "o", limit: 10 });
    expect(searchFn).toHaveBeenCalledWith(
      expect.objectContaining({ query: "o", schema_ids: ["linkedin.profile"] }),
    );
    // Backend order (stable total order) is preserved — no client re-sort
    // (re-sorting broke pagination windows, live bug #3).
    expect(r.items.map((i) => i.display_name)).toEqual(["Bob Builder", "Ann Doe"]);
    expect(r.items[1]).toMatchObject({ handle: "ann", follower_count: 5 });
  });
});
