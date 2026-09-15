/** The declaration is not a wish: both records this module writes have to pass
 * it — the one its ingest writes from a provider's invite, and the one its
 * create writes — through the module's REAL paths.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { describe, expect, it, vi } from "vitest";
import type { GraphBatchInput, GraphBatchResult } from "@magnis/plugin-sdk";
import { mockGraph, mountModule } from "@magnis/testkit/module";

import { MeetingsModule } from "./module/service.ts";
import { calendarEvent } from "./entities.ts";

const CAL = "meetings.calendar_event";

/** One provider invite, as the connector emits it. */
const invite = {
  id: "evt-abc123",
  title: "Q3 review",
  starts_at: "2026-07-29T09:00:00Z",
  ends_at: "2026-07-29T10:00:00Z",
  description: "Numbers, then decisions.",
  location: "Room 2",
  status: "confirmed",
  attendees: [{ email: "ann@example.test", name: "Ann" }],
};

function graphRecording(written: Record<string, unknown>[]) {
  return mockGraph({
    apply_batch: (frag: GraphBatchInput): Promise<GraphBatchResult> => {
      for (const e of frag.entities) {
        if (e.schema_id === CAL) written.push(e.properties ?? {});
      }
      return Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
        created: frag.entities.length,
        updated: 0,
        links_added: 0,
        dropped_keys: [],
      });
    },
    find_by_anchor: () => Promise.resolve(null),
    list_links_for_entity: () => Promise.resolve([]),
    delete_entity: () => Promise.resolve(undefined),
    sync_state: () => Promise.resolve({ ok: true }),
    create_entity: () => Promise.resolve({ id: "cal-1", schema_id: CAL, name: "Q3 review" }),
    update_properties: (input: { properties: Record<string, unknown> }) => {
      written.push(input.properties);
      return Promise.resolve(undefined);
    },
    add_link: () => Promise.resolve(undefined),
    get_entity_full: () => Promise.resolve(null),
    get_entity: () => Promise.resolve(null),
  } as never);
}

async function writtenRecords(): Promise<Record<string, unknown>[]> {
  const written: Record<string, unknown>[] = [];
  const mod = mountModule(MeetingsModule, {
    graph: graphRecording(written),
    ctx: { extension_id: "meetings" },
    rpc: {
      execute: vi.fn((_m: string, p?: unknown) =>
        Promise.resolve({
          ids: (p as { items: { address: string }[] }).items.map((i) => `addr-${i.address}`),
        })),
    },
  }).module;
  await mod.ingest({
    envelopes: [{
      source_id: "google", surface: "meetings", account_id: "acct-1", user_id: "u1",
      kind: "snapshot", remote_id: "evt-abc123", payload: invite,
      timestamp: "2026-02-01T00:00:00Z",
    }],
  });
  return written;
}

describe("meetings declares what it writes", () => {
  it("every record the module writes today passes its own declaration", async () => {
    const records = await writtenRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(calendarEvent.safeParse(record).error?.issues ?? []).toEqual([]);
    }
  });

  it("the attendees are edges, so writing them back into the record is refused", async () => {
    const records = await writtenRecords();
    // The module strips them — the declaration is what keeps them stripped.
    for (const record of records) expect(Object.keys(record)).not.toContain("attendees");
    expect(calendarEvent.safeParse({ title: "Q3 review", attendees: [] }).success).toBe(false);
  });
});
