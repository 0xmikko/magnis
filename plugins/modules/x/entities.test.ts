/** The declaration is not a wish: both records this module stores have to pass
 * it, through the module's REAL ingest rather than copied payloads.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { describe, expect, it, vi } from "vitest";
import type { GraphBatchInput } from "@magnis/plugin-sdk";
import { mockGraph, mountModule } from "@magnis/testkit/module";

import { XModule } from "./module/service.ts";
import { post, profile } from "./entities.ts";

const DECLARED = { "x.profile": profile, "x.post": post } as const;

const env = (remote_id: string, payload: Record<string, unknown>) => ({
  source_id: "x", surface: "x", account_id: "a1", user_id: "u1",
  kind: "snapshot", remote_id, payload, timestamp: "2026-06-26T00:00:00Z",
});

async function written(): Promise<GraphBatchInput["entities"]> {
  const batches: GraphBatchInput[] = [];
  const graph = mockGraph({
    apply_batch: (frag: GraphBatchInput) => {
      batches.push(frag);
      return Promise.resolve({ ids: {}, created: 0, updated: 0, links_added: 0, dropped_keys: [] });
    },
    list_entities_window: () => Promise.resolve({ items: [], total: 0 }),
    get_entity_full: () => Promise.resolve(null),
  });
  const mod = mountModule<XModule>(XModule, {
    graph, ctx: { extension_id: "x" }, rpc: { execute: vi.fn() },
  }).module;
  await mod.ingest({
    envelopes: [
      env("x:profile:jack", {
        entity_type: "profile", platform: "x", handle: "jack",
        display_name: "Jack", bio: "here", verified: true, follower_count: 100,
        url: "https://x.com/jack", avatar_url: "https://x.com/jack.jpg",
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
      const declared = DECLARED[e.schema_id as keyof typeof DECLARED];
      expect(declared, `${e.schema_id} is written but not declared`).toBeDefined();
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
