/** The declaration is not a wish: both records this module stores have to pass
 * it, through the module's REAL ingest rather than copied payloads.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { describe, expect, it, vi } from "vitest";
import type { GraphBatchInput, JsonObject, SyncEnvelope } from "@magnis/sdk";
import { mockGraph, mountModule, page } from "@magnis/testkit/module";

import { XModule } from "./module/service.ts";
import { post, profile } from "./entities.ts";

const DECLARED = { "x.profile": profile, "x.post": post } as const;

const env = (remoteId: string, payload: JsonObject): SyncEnvelope => ({
  sourceId: "x", surface: "x", accountId: "a1", userId: "u1",
  kind: "snapshot", remoteId, payload, timestamp: "2026-06-26T00:00:00Z",
});

async function written(): Promise<GraphBatchInput["entities"]> {
  const batches: GraphBatchInput[] = [];
  const graph = mockGraph({
    find_by_external_ids: (externalIds) => Promise.resolve(externalIds.map(() => null)),
    apply_batch: (frag: GraphBatchInput) => {
      batches.push(frag);
      return Promise.resolve({ ids: {}, created: 0, updated: 0, linksAdded: 0, droppedKeys: [] });
    },
    list_entities_window: () => Promise.resolve(page([])),
    get_entity_full: () => Promise.resolve(null),
  });
  const mod = mountModule<XModule>(XModule, {
    graph, ctx: { extensionId: "x" }, rpc: { execute: vi.fn() },
  }).module;
  await mod.ingest({
    generation: "initial:r:1",
    envelopes: [
      env("x:profile:jack", {
        entity_type: "profile", platform: "x", handle: "jack",
        display_name: "Jack", bio: "here", verified: true, follower_count: 100,
        url: "https://x.com/jack", avatar_url: "https://x.com/jack.jpg",
        posts_total: 10, posts_skipped: 1190,
      }),
      env("x:post:1", {
        entity_type: "post", platform: "x", post_id: "1", author_handle: "jack",
        text: "hello", created_at: "2026-06-26T00:00:00Z", url: "https://x.com/jack/1",
        is_reply: false, is_repost: false, lang: "en",
        metrics: { likes: 3, reposts: 1, replies: 0, impressions: 90 },
      }),
    ],
  });
  return batches.flatMap((b) => b.entities);
}

describe("x declares what it stores", () => {
  it("every record the module writes today passes its own declaration", async () => {
    const entities = await written();
    expect(entities.length).toBeGreaterThan(1);
    for (const e of entities) {
      const declared = DECLARED[e.schemaId as keyof typeof DECLARED];
      expect(declared, `${e.schemaId} is written but not declared`).toBeDefined();
      expect(declared.safeParse(e.properties ?? {}).error?.issues ?? []).toEqual([]);
    }
  });

  it("a field the module does not declare is refused, and the error names it", () => {
    const verdict = post.safeParse({
      entity_type: "post", platform: "x", post_id: "1", author_handle: "jack",
      text: "hello", quote_count: 2,
    });
    expect(verdict.success).toBe(false);
    expect(JSON.stringify(verdict.error?.issues)).toContain("quote_count");
  });
});
