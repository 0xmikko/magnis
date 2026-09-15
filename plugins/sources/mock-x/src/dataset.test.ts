import { describe, expect, test } from "bun:test";
import { emitPost, emitProfile } from "./dataset";

describe("mock-x dataset actions", () => {
  test("tst_conn_mockx_dataset_001 emits a stable production-shaped profile", async () => {
    const args = {
      action: "emit_profile",
      invocation_id: "inv-profile",
      action_time: "2026-07-26T00:00:00Z",
      settings: {},
      payload: { handle: "celia_ortiz", display_name: "Celia Ortiz", bio: "Design at Asteria Grid" },
    };
    const first = await emitProfile(args);
    expect(await emitProfile(args)).toEqual(first);
    expect(first.envelopes).toEqual([
      {
        surface: "x",
        remote_id: "dataset:inv-profile:0",
        kind: "live",
        payload: {
          entity_type: "profile",
          platform: "x",
          handle: "celia_ortiz",
          display_name: "Celia Ortiz",
          url: "https://x.com/celia_ortiz",
          bio: "Design at Asteria Grid",
        },
      },
    ]);
  });

  test("tst_conn_mockx_dataset_002 emits a production-shaped post under its author", async () => {
    const result = await emitPost({
      action: "emit_post",
      invocation_id: "inv-post",
      action_time: "2026-07-26T00:00:00Z",
      settings: {},
      payload: {
        post_id: "x:post:celia-asteria",
        handle: "celia_ortiz",
        text: "New chapter: joining Asteria Grid to lead design.",
        posted_at: "2026-07-01T09:30:00Z",
      },
    });
    expect(result.envelopes).toEqual([
      {
        surface: "x",
        remote_id: "dataset:inv-post:0",
        kind: "live",
        payload: {
          entity_type: "post",
          platform: "x",
          post_id: "x:post:celia-asteria",
          author_handle: "celia_ortiz",
          text: "New chapter: joining Asteria Grid to lead design.",
          created_at: "2026-07-01T09:30:00Z",
          url: "https://x.com/celia_ortiz/status/x:post:celia-asteria",
          post_type: "post",
        },
      },
    ]);
  });

  test("tst_conn_mockx_dataset_003 rejects a post without an author, a text or a valid time", async () => {
    const base = { action: "emit_post", invocation_id: "bad", action_time: "2026-07-26T00:00:00Z", settings: {} };
    await expect(emitPost({ ...base, payload: { post_id: "p", text: "t", posted_at: "2026-07-01T09:30:00Z" } })).rejects.toThrow(/invalid emit_post payload: handle/);
    await expect(emitPost({ ...base, payload: { post_id: "p", handle: "h", posted_at: "2026-07-01T09:30:00Z" } })).rejects.toThrow(/invalid emit_post payload: text/);
    await expect(emitPost({ ...base, payload: { post_id: "p", handle: "h", text: "t", posted_at: "yesterday" } })).rejects.toThrow(/invalid emit_post payload: posted_at/);
    await expect(emitProfile({ ...base, action: "emit_profile", payload: { display_name: "No Handle" } })).rejects.toThrow(/invalid emit_profile payload: handle/);
  });
});
