// tst_plugin_linkedin_ingest — sync ingest builds an idempotent apply_batch
// (profiles + posts + authored_by link, external_id = remote_id) and read tools
// map window rows. Doubles from @magnis/testkit/module (mockGraph = throwing
// Proxy, so any op a test does not arrange fails loudly).
import { describe, expect, it, vi } from "vitest";
import { entity, facet, mockGraph, mountModule, windowRow, type MockGraph } from "@magnis/testkit/module";
import { LinkedinModule } from "../service.ts";
import {
  AUTHORED_BY,
  POST,
  POST_CONTENT,
  PROFILE,
  PROFILE_IDENTITY,
  PROFILE_PERSON_LINK,
} from "../../schema.ts";
import type { LinkedinCanonical, LinkedinFacets, SyncEnvelope } from "../../types.ts";

type G = MockGraph<LinkedinFacets, LinkedinCanonical>;

// SyncEnvelope is a module DTO (not an SDK type), so its builder stays local.
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

const emptyBatch = { ids: {}, created: 0, updated: 0, links_added: 0, dropped_keys: [] };

describe("linkedin ingest", () => {
  it("tst_plugin_linkedin_ingest_001 builds one apply_batch with profile+post+link, external_id=remote_id", async () => {
    const graph: G = mockGraph({ apply_batch: () => Promise.resolve(emptyBatch) });
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extension_id: "linkedin" } });

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
    const applyBatch = graph.spies.apply_batch;
    if (applyBatch === undefined) throw new Error("linkedin ingest 001: missing apply_batch spy");
    expect(applyBatch).toHaveBeenCalledTimes(1);
    const batchCall = applyBatch.mock.calls[0];
    if (batchCall === undefined) throw new Error("linkedin ingest 001: no apply_batch call recorded");
    const batch = batchCall[0];
    expect(batch.entities).toHaveLength(2);

    const profile = batch.entities.find((e: { schema_id: string }) => e.schema_id === PROFILE);
    const post = batch.entities.find((e: { schema_id: string }) => e.schema_id === POST);
    expect(profile.facets[0]).toMatchObject({ schema_id: PROFILE_IDENTITY, external_id: "linkedin:profile:jack" });
    expect(post.facets[0]).toMatchObject({ schema_id: POST_CONTENT, external_id: "linkedin:post:1" });
    // authored_by link wired within the page (author_handle "Jack" → profile "jack").
    expect(batch.links).toEqual([
      { from_key: "linkedin:post:1", to_key: "linkedin:profile:jack", kind: AUTHORED_BY },
    ]);
  });

  it("tst_plugin_linkedin_ingest_002 re-ingest keeps the same external_id (idempotent)", async () => {
    const graph: G = mockGraph({ apply_batch: () => Promise.resolve(emptyBatch) });
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extension_id: "linkedin" } });
    const e = env("linkedin:post:1", {
      entity_type: "post",
      platform: "x",
      post_id: "1",
      author_handle: "jack",
      text: "v1",
    });

    await mod.ingest({ envelopes: [e] });
    await mod.ingest({ envelopes: [{ ...e, payload: { ...e.payload, text: "v2" } }] });

    const applyBatch = graph.spies.apply_batch;
    if (applyBatch === undefined) throw new Error("linkedin ingest 002: missing apply_batch spy");
    const firstCall = applyBatch.mock.calls[0];
    const secondCall = applyBatch.mock.calls[1];
    if (firstCall === undefined || secondCall === undefined) throw new Error("linkedin ingest 002: missing apply_batch call");
    const first = firstCall[0].entities[0].facets[0].external_id;
    const second = secondCall[0].entities[0].facets[0].external_id;
    expect(first).toBe("linkedin:post:1");
    expect(second).toBe("linkedin:post:1"); // same id → host upserts, no duplicate entity
  });

  it("tst_plugin_linkedin_ingest_003 posts.list maps window rows", async () => {
    const graph: G = mockGraph({
      list_entities_window: () =>
        Promise.resolve({
          items: [
            windowRow(entity("p1", "hello", { schema_id: POST }), {
              platform: "x",
              author_handle: "jack",
              text: "hello",
              created_at: "t",
              url: null,
            }),
          ],
          total: 1,
        }),
    });
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extension_id: "linkedin" } });

    const page = await mod.postsList({});
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ id: "p1", platform: "x", author_handle: "jack", text: "hello" });
    expect(graph.spies.list_entities_window).toHaveBeenCalledTimes(1);
  });
});

// tst_ingest_link — social-contact identity link:
// a tracked-handle profile gets exactly one profile→person identity link and
// the placeholder-name CAS upgrade; an untracked handle gets neither.
describe("linkedin ingest identity link (tst_ingest_link)", () => {
  function linkGraph(): G {
    return mockGraph({
      apply_batch: () =>
        Promise.resolve({ ids: { "linkedin:profile:12": "prof-1" }, created: 1, updated: 0, links_added: 0, dropped_keys: [] }),
      add_link: () => Promise.resolve(),
    });
  }

  const profileEnv = env("linkedin:profile:12", {
    entity_type: "profile",
    platform: "linkedin",
    handle: "anndoe",
    display_name: "Ann Doe",
  });

  it("tracked handle → one identity link + CAS rename call", async () => {
    const graph = linkGraph();
    const execute = vi.fn(async (method: string) => {
      if (method === "contacts.get_social_tracking_by_handle") {
        return { contact_id: "c1", tracked: true, handle: "anndoe" };
      }
      if (method === "contacts.rename_if_placeholder") return { renamed: true };
      throw new Error(`unexpected rpc ${method}`);
    });
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extension_id: "linkedin" }, rpc: { execute } });

    await mod.ingest({ envelopes: [profileEnv] });

    expect(graph.spies.add_link).toHaveBeenCalledTimes(1);
    expect(graph.spies.add_link).toHaveBeenCalledWith({
      from_id: "prof-1",
      to_id: "c1",
      kind: PROFILE_PERSON_LINK,
    });
    expect(execute).toHaveBeenCalledWith("contacts.rename_if_placeholder", {
      id: "c1",
      expected_name: "anndoe",
      new_name: "Ann Doe",
    });
  });

  it("untracked handle → no link, no rename", async () => {
    const graph = linkGraph();
    const execute = vi.fn(async () => null);
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extension_id: "linkedin" }, rpc: { execute } });
    await mod.ingest({ envelopes: [profileEnv] });
    expect(graph.spies.add_link).not.toHaveBeenCalled();
  });

  it("rpc failure never fails the ingest (self-healing next cycle)", async () => {
    const graph = linkGraph();
    const execute = vi.fn(async () => {
      throw new Error("hub unavailable");
    });
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extension_id: "linkedin" }, rpc: { execute } });
    const res = await mod.ingest({ envelopes: [profileEnv] });
    expect(res.ok).toBe(true);
    expect(graph.spies.add_link).not.toHaveBeenCalled();
  });
});

// tst_profiles_search (live bug 2026-07-03): the framework list pane passes
// `search` into profiles.list; the tool must accept it (schema) and filter by
// name — previously additionalProperties:false rejected the call and the
// standard search box silently did nothing on this module.
describe("linkedin profiles.list search", () => {
  it("search → search_entities_by_name, facets hydrated, BACKEND order preserved", async () => {
    const graph: G = mockGraph({
      search_entities_by_name: () =>
        Promise.resolve([
          entity("e2", "Bob Builder", { schema_id: PROFILE }),
          entity("e1", "Ann Doe", { schema_id: PROFILE }),
        ]),
      list_facets_for_entities: () =>
        Promise.resolve([
          facet("f1", PROFILE_IDENTITY, { handle: "ann", follower_count: 5, avatar_url: "https://a/1.jpg" }, { entity_id: "e1", source: "s", observed_at: "2026-01-02T00:00:00Z" }),
          facet("f2", PROFILE_IDENTITY, { handle: "bob", follower_count: 7, avatar_url: null }, { entity_id: "e2", source: "s", observed_at: "2026-01-02T00:00:00Z" }),
        ]),
    });
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extension_id: "linkedin" } });

    const r = await mod.profilesList({ search: "o", limit: 10 });
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledWith(
      expect.objectContaining({ query: "o", schema_ids: [PROFILE] }),
    );
    // Backend order (stable total order) is preserved — no client re-sort
    // (re-sorting broke pagination windows, live bug #3).
    expect(r.items.map((i) => i.display_name)).toEqual(["Bob Builder", "Ann Doe"]);
    expect(r.items[1]).toMatchObject({ handle: "ann", follower_count: 5 });
  });
});
