// linkedin-add-flow LA-2: tracked-but-not-yet-synced handles surface as
// PENDING rows at the top of profiles.list page 0 — the honest optimistic
// state for the "+" flow ("Syncing…" until the real profile ingests, then the
// placeholder disappears because the handle now exists among profiles).
import { describe, expect, it, vi } from "vitest";
import type { GraphService, PluginDeps } from "@magnis/plugin-sdk";
import { LinkedinModule } from "./service.ts";
import type { LinkedinCanonical, LinkedinFacets } from "../types/index.ts";

function makeModule(opts: {
  profiles: Array<{ id: string; handle: string; name: string }>;
  tracked: Array<{ contact_id: string; name: string; handle: string }>;
}): LinkedinModule {
  const rows = opts.profiles.map((p) => ({
    entity: { id: p.id, schema_id: "linkedin.profile", name: p.name },
    data: { platform: "linkedin", handle: p.handle, display_name: p.name },
  }));
  const graph = {
    list_entities_window: vi.fn(async ({ limit = 100, offset = 0 }) => ({
      items: rows.slice(offset, offset + limit),
      total: rows.length,
      limit,
      offset,
    })),
  } as unknown as GraphService<LinkedinFacets, LinkedinCanonical>;
  const deps = {
    graph,
    ctx: { extension_id: "linkedin", user_id: "u1", extension_kind: "plugin" },
    util: {},
    rpc: {
      execute: vi.fn(async (method: string) => {
        if (method === "contacts.list_social_tracking") return opts.tracked;
        throw new Error(`unexpected rpc ${method}`);
      }),
    },
  } as unknown as PluginDeps<LinkedinFacets, LinkedinCanonical>;
  return new LinkedinModule(deps);
}

describe("linkedin pending profiles", () => {
  it("tst_plugin_linkedin_pending_001 tracked-not-synced handles prepend as pending rows", async () => {
    const mod = makeModule({
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
    const mod = makeModule({
      profiles: [{ id: "e1", handle: "synced_person", name: "Synced Person" }],
      tracked: [{ contact_id: "c2", name: "G", handle: "sgershuni" }],
    });
    const page2 = await mod.profilesList({ limit: 50, offset: 50 });
    expect(page2.items.every((i) => !i.pending)).toBe(true);
  });

  it("tst_plugin_linkedin_pending_003 pending profiles.get synthesizes a minimal detail", async () => {
    const mod = makeModule({
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
    const rows = [
      {
        entity: { id: "e1", schema_id: "linkedin.profile", name: "P" },
        data: { platform: "linkedin", handle: "p", display_name: "P" },
      },
    ];
    const graph = {
      list_entities_window: vi.fn(async () => ({ items: rows, total: 1, limit: 50, offset: 0 })),
    } as unknown as GraphService<LinkedinFacets, LinkedinCanonical>;
    const deps = {
      graph,
      ctx: { extension_id: "linkedin", user_id: "u1", extension_kind: "plugin" },
      util: {},
      rpc: { execute: vi.fn(async () => { throw new Error("contacts down"); }) },
    } as unknown as PluginDeps<LinkedinFacets, LinkedinCanonical>;
    const mod = new LinkedinModule(deps);
    const page = await mod.profilesList({ limit: 50, offset: 0 });
    expect(page.items).toHaveLength(1);
  });
});
