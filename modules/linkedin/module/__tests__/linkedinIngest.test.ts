// tst_plugin_linkedin_ingest — sync ingest builds an idempotent applyBatch
// (profiles + posts + authored_by link, each node keyed by its externalId: a
// profile on its URN, a post on its remote id) and read tools map window
// entities. Doubles from @magnis/testkit/module (mockGraph = throwing
// Proxy, so any op a test does not arrange fails loudly).
import { describe, expect, it, vi } from "vitest";
import type { BatchEntityInput, GraphBatchInput, JsonObject, SyncEnvelope } from "@magnis/sdk";
import { entity, mockGraph, mountModule, page, type MockGraph } from "@magnis/testkit/module";
import { LinkedinModule } from "../service.ts";
import { AUTHORED_BY, IDENTITY, POST, PROFILE } from "../../schema.ts";

type G = MockGraph;

function env(remoteId: string, payload: JsonObject): SyncEnvelope {
  return {
    sourceId: "x",
    surface: "linkedin",
    accountId: "a1",
    userId: "u1",
    kind: "snapshot",
    remoteId,
    payload,
    timestamp: "2026-06-26T00:00:00Z",
  };
}

const emptyBatch = { ids: {}, created: 0, updated: 0, linksAdded: 0, droppedKeys: [] };
const stated = { droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] };

describe("linkedin ingest", () => {
  it("tst_plugin_linkedin_ingest_001 builds one applyBatch with profile+post+link, each node keyed by its externalId", async () => {
    const graph: G = mockGraph({ applyBatch: () => Promise.resolve(emptyBatch) });
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extensionId: "linkedin" } });

    const res = await mod.ingest({
      envelopes: [
        env("linkedin:profile:ACoAAB123", {
          entity_type: "profile",
          platform: "x",
          urn: "ACoAAB123",
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

    expect(res).toEqual(stated);
    const applyBatch = graph.spies.applyBatch;
    if (applyBatch === undefined) throw new Error("linkedin ingest 001: missing applyBatch spy");
    expect(applyBatch).toHaveBeenCalledTimes(1);
    const batchCall = applyBatch.mock.calls[0];
    if (batchCall === undefined) throw new Error("linkedin ingest 001: no applyBatch call recorded");
    const batch = batchCall[0];
    expect(batch.entities).toHaveLength(2);

    const profile = batch.entities.find((e: BatchEntityInput) => e.schemaId === PROFILE);
    const post = batch.entities.find((e: BatchEntityInput) => e.schemaId === POST);
    // The dictionary IS the record, under an externalId its issuer will not rename.
    expect(profile.externalId).toBe("linkedin:ACoAAB123");
    expect(profile.properties).toMatchObject({ handle: "jack", follower_count: 100 });
    expect(post.externalId).toBe("linkedin:post:1");
    // content AND metrics in ONE dictionary.
    expect(post.properties).toMatchObject({ text: "hello world", metrics: { likes: 5 } });
    // authored_by link wired within the page (author_handle "Jack" → profile "jack").
    expect(batch.links).toEqual([
      {
        fromKey: "linkedin:post:1",
        toKey: "linkedin:profile:ACoAAB123",
        kind: AUTHORED_BY,
        confidence: null,
        metadata: null,
        declaredBy: "linkedin:post:1",
        validFrom: null,
        validUntil: null,
      },
    ]);
  });

  it("tst_plugin_linkedin_ingest_002 re-ingest keeps the same externalId (idempotent)", async () => {
    const graph: G = mockGraph({ applyBatch: () => Promise.resolve(emptyBatch) });
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extensionId: "linkedin" } });
    const payload = {
      entity_type: "post",
      platform: "x",
      post_id: "1",
      author_handle: "jack",
      text: "v1",
    };

    await mod.ingest({ envelopes: [env("linkedin:post:1", payload)] });
    await mod.ingest({ envelopes: [env("linkedin:post:1", { ...payload, text: "v2" })] });

    const applyBatch = graph.spies.applyBatch;
    if (applyBatch === undefined) throw new Error("linkedin ingest 002: missing applyBatch spy");
    const firstCall = applyBatch.mock.calls[0];
    const secondCall = applyBatch.mock.calls[1];
    if (firstCall === undefined || secondCall === undefined) throw new Error("linkedin ingest 002: missing applyBatch call");
    const first = firstCall[0].entities[0].externalId;
    const second = secondCall[0].entities[0].externalId;
    expect(first).toBe("linkedin:post:1");
    expect(second).toBe("linkedin:post:1"); // same externalId → host upserts, no duplicate entity
  });

  it("tst_plugin_linkedin_ingest_003 posts.list maps window entities", async () => {
    const graph: G = mockGraph({
      listEntitiesWindow: () =>
        Promise.resolve(page([
          entity("p1", "hello", {
            schemaId: POST,
            properties: {
              platform: "x",
              author_handle: "jack",
              text: "hello",
              created_at: "t",
              url: null,
            },
          }),
        ])),
    });
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extensionId: "linkedin" } });

    const listed = await mod.postsList({});
    expect(listed.total).toBe(1);
    expect(listed.items[0]).toMatchObject({ id: "p1", platform: "x", author_handle: "jack", text: "hello" });
    expect(graph.spies.listEntitiesWindow).toHaveBeenCalledTimes(1);
  });
});

// tst_ingest_link — social-contact identity link:
// a tracked-handle profile gets exactly one person→profile identity edge and
// the placeholder-name CAS upgrade; an untracked handle gets neither.
/**
 * @test-id: tst_plugin_linkedin_plan_001
 * @scenario: scn_linkedin_sync_001
 * @covers: LinkedinModule.ingest (plan)
 * @deterministic: yes
 * @fixtures: a profile envelope with its urn and a post; the profile known with a pass stamp
 */
describe("linkedin ingest — the plan from the pages", () => {
  const profile = (): SyncEnvelope => env("linkedin:profile:jane", { entity_type: "profile", platform: "linkedin", handle: "jane", urn: "urn:li:person:1", display_name: "Jane" });
  const post = (): SyncEnvelope => env("linkedin:post:1", { entity_type: "post", platform: "linkedin", post_id: "1", author_handle: "jane", text: "hello", created_at: "2026-06-01T00:00:00Z", metrics: {} });
  function planGraph(known: Record<string, JsonObject>): G {
    return mockGraph({
      findByExternalIds: (externalIds: string[]) => Promise.resolve(externalIds.map((externalId) => (externalId in known ? `id:${externalId}` : null))),
      getEntities: (ids: string[]) => Promise.resolve(ids.map((id) => entity(id, "", { schemaId: PROFILE, properties: known[id.slice("id:".length)] ?? {} }))),
      applyBatch: () => Promise.resolve(emptyBatch),
    });
  }

  it("states a profile once per pass, stamps the pass, and states nothing for posts", async () => {
    const fresh = planGraph({});
    const first = await mountModule(LinkedinModule, { graph: fresh, ctx: { extensionId: "linkedin" }, rpc: { execute: vi.fn() } }).module
      .ingest({ generation: "initial:r:1", envelopes: [profile(), post()] });
    expect(first).toEqual({ ...stated, plan: { [PROFILE]: { total: 1, skipped: 0 } } });
    const batch = fresh.spies.applyBatch?.mock.calls[0]?.[0] as GraphBatchInput;
    expect(batch.entities.find((item) => item.schemaId === PROFILE)?.properties).toMatchObject({ urn: "urn:li:person:1", sync_pass: "initial:r:1" });

    const stamped = planGraph({ "linkedin:urn:li:person:1": { handle: "jane", sync_pass: "initial:r:1" } });
    const later = await mountModule(LinkedinModule, { graph: stamped, ctx: { extensionId: "linkedin" }, rpc: { execute: vi.fn() } }).module
      .ingest({ generation: "initial:r:1", envelopes: [profile(), post()] });
    expect(later.plan).toEqual({ [PROFILE]: { total: 0, skipped: 0 } });

    const outside = await mountModule(LinkedinModule, { graph: mockGraph({ applyBatch: () => Promise.resolve(emptyBatch) }), ctx: { extensionId: "linkedin" }, rpc: { execute: vi.fn() } }).module
      .ingest({ envelopes: [profile(), post()] });
    expect(outside).toEqual(stated);
  });
});

describe("linkedin ingest identity link (tst_ingest_link)", () => {
  function linkGraph(): G {
    return mockGraph({
      applyBatch: () =>
        Promise.resolve({ ids: { "linkedin:profile:12": "prof-1" }, created: 1, updated: 0, linksAdded: 0, droppedKeys: [] }),
      addLink: () => Promise.resolve(),
    });
  }

  const profileEnv = env("linkedin:profile:12", {
    entity_type: "profile",
    platform: "linkedin",
    urn: "ACoAAB12",
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
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extensionId: "linkedin" }, rpc: { execute } });

    await mod.ingest({ envelopes: [profileEnv] });

    expect(graph.spies.addLink).toHaveBeenCalledTimes(1);
    // `identity` runs hub → channel: the contact is the FROM endpoint.
    expect(graph.spies.addLink).toHaveBeenCalledWith({
      from: "c1",
      to: "prof-1",
      kind: IDENTITY,
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
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extensionId: "linkedin" }, rpc: { execute } });
    await mod.ingest({ envelopes: [profileEnv] });
    expect(graph.spies.addLink).not.toHaveBeenCalled();
  });

  it("rpc failure never fails the ingest (self-healing next cycle)", async () => {
    const graph = linkGraph();
    const execute = vi.fn(async () => {
      throw new Error("hub unavailable");
    });
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extensionId: "linkedin" }, rpc: { execute } });
    const res = await mod.ingest({ envelopes: [profileEnv] });
    expect(res).toEqual(stated);
    expect(graph.spies.addLink).not.toHaveBeenCalled();
  });
});

// tst_profiles_search (live bug 2026-07-03): the framework list pane passes
// `search` into profiles.list; the tool must accept it (schema) and filter by
// name — previously additionalProperties:false rejected the call and the
// standard search box silently did nothing on this module.
describe("linkedin profiles.list search", () => {
  it("search → searchEntitiesByName, dictionaries ride the rows, BACKEND order preserved", async () => {
    const graph: G = mockGraph({
      searchEntitiesByName: () =>
        Promise.resolve([
          entity("e2", "Bob Builder", {
            schemaId: PROFILE,
            properties: { handle: "bob", follower_count: 7, avatar_url: null },
          }),
          entity("e1", "Ann Doe", {
            schemaId: PROFILE,
            properties: { handle: "ann", follower_count: 5, avatar_url: "https://a/1.jpg" },
          }),
        ]),
    });
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extensionId: "linkedin" } });

    const r = await mod.profilesList({ search: "o", limit: 10 });
    expect(graph.spies.searchEntitiesByName).toHaveBeenCalledWith(
      expect.objectContaining({ query: "o", schemaIds: [PROFILE] }),
    );
    // Backend order (stable total order) is preserved — no client re-sort
    // (re-sorting broke pagination windows, live bug #3).
    expect(r.items.map((i) => i.display_name)).toEqual(["Bob Builder", "Ann Doe"]);
    expect(r.items[1]).toMatchObject({ handle: "ann", follower_count: 5 });
  });
});
