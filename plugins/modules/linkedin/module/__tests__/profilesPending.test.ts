// Tracked-but-not-yet-synced handles surface as
// PENDING rows at the top of profiles.list page 0 — the honest optimistic
// state for the "+" flow ("Syncing…" until the real profile ingests, then the
// placeholder disappears because the handle now exists among profiles).
// Doubles from @magnis/testkit/module.
import { describe, expect, it, vi } from "vitest";
import type { WindowSpec } from "@magnis/plugin-sdk";
import { entity, mockGraph, mountModule, windowRow, type MockGraph } from "@magnis/testkit/module";
import { LinkedinModule } from "../service.ts";
import { PROFILE } from "../../schema.ts";
import type { LinkedinCanonical, LinkedinFacets } from "../../types.ts";

type G = MockGraph<LinkedinFacets, LinkedinCanonical>;

// Scenario fixture over the testkit: an ingested-profile window (paged by the
// window's limit/offset) + a contacts.list_social_tracking RPC stub. Replaces
// the old hand-rolled makeGraph/makeModule.
function mountProfiles(opts: {
  profiles: Array<{ id: string; handle: string; name: string }>;
  tracked: Array<{ contact_id: string; name: string; handle: string }>;
}): LinkedinModule {
  const rows = opts.profiles.map((p) =>
    windowRow(entity(p.id, p.name, { schema_id: PROFILE }), {
      platform: "linkedin",
      handle: p.handle,
      display_name: p.name,
    }),
  );
  const graph: G = mockGraph({
    list_entities_window: (p: WindowSpec) =>
      Promise.resolve({ items: rows.slice(p.offset, p.offset + p.limit), total: rows.length }),
  });
  const execute = vi.fn(async (method: string) => {
    if (method === "contacts.list_social_tracking") return opts.tracked;
    throw new Error(`unexpected rpc ${method}`);
  });
  return mountModule(LinkedinModule, { graph, ctx: { extension_id: "linkedin" }, rpc: { execute } }).module;
}

describe("linkedin pending profiles", () => {
  it("tst_plugin_linkedin_pending_001 tracked-not-synced handles prepend as pending rows", async () => {
    const mod = mountProfiles({
      profiles: [{ id: "e1", handle: "synced_person", name: "Synced Person" }],
      tracked: [
        { contact_id: "c1", name: "Synced Person", handle: "synced_person" },
        { contact_id: "c2", name: "Stepan Gershuni", handle: "sgershuni" },
      ],
    });
    const page = await mod.profilesList({ limit: 50, offset: 0 });
    expect(page.items[0]).toMatchObject({
      id: "pending:sgershuni",
      handle: "sgershuni",
      display_name: "Stepan Gershuni",
      pending: true,
    });
    // The already-synced handle is NOT duplicated as pending.
    expect(page.items.filter((i) => i.pending)).toHaveLength(1);
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(2);
  });

  it("tst_plugin_linkedin_pending_002 no pending rows on page 2+ or in search mode", async () => {
    const mod = mountProfiles({
      profiles: [{ id: "e1", handle: "synced_person", name: "Synced Person" }],
      tracked: [{ contact_id: "c2", name: "G", handle: "sgershuni" }],
    });
    const page2 = await mod.profilesList({ limit: 50, offset: 50 });
    expect(page2.items.every((i) => !i.pending)).toBe(true);
  });

  it("tst_plugin_linkedin_pending_003 pending profiles.get synthesizes a minimal detail", async () => {
    const mod = mountProfiles({
      profiles: [],
      tracked: [{ contact_id: "c2", name: "Stepan Gershuni", handle: "sgershuni" }],
    });
    const detail = await mod.profilesGet({ id: "pending:sgershuni" });
    expect(detail).toMatchObject({
      id: "pending:sgershuni",
      handle: "sgershuni",
      display_name: "Stepan Gershuni",
      pending: true,
      platform: "linkedin",
    });
  });

  it("tst_plugin_linkedin_pending_004 a tracking-RPC failure never breaks the list", async () => {
    const graph: G = mockGraph({
      list_entities_window: () =>
        Promise.resolve({
          items: [
            windowRow(entity("e1", "P", { schema_id: PROFILE }), {
              platform: "linkedin",
              handle: "p",
              display_name: "P",
            }),
          ],
          total: 1,
        }),
    });
    const execute = vi.fn(async () => {
      throw new Error("contacts down");
    });
    const { module: mod } = mountModule(LinkedinModule, { graph, ctx: { extension_id: "linkedin" }, rpc: { execute } });
    const page = await mod.profilesList({ limit: 50, offset: 0 });
    expect(page.items).toHaveLength(1);
  });
});
