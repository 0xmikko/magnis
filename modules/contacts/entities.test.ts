/** The declaration is not a wish: both records this module writes have to pass
 * it — the Google replica its ingest writes, and the curated hub claims its
 * create writes — through the module's REAL paths rather than copied records.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { describe, expect, it, vi } from "vitest";
import type { BatchEntityInput, GraphBatchInput } from "@magnis/plugin-sdk";
import { entity as graphEntity, mockGraph, mountModule } from "@magnis/testkit/module";

import { ContactsModule } from "./module/service.ts";
import { googleContact, person } from "./entities.ts";
import { CONTACT } from "./schema.ts";

const CONTACT_ID = "44444444-4444-4444-8444-444444444444";

/** One Google connector Contact payload, as the ingest test spells it. */
const contactPayload = {
  id: "abc123",
  display_name: "Mikhail Lazarev",
  given_name: "Mikhail",
  family_name: "Lazarev",
  emails: [{ address: "mikhail@example.com", label: "work", is_primary: true }],
  phones: [{ number: "+4930 1234567", label: "mobile", is_primary: true }],
  organizations: [{ name: "Acme", title: "Engineer", is_current: true }],
  photo_url: "https://photos.example.com/a.jpg",
  external_url: "https://contacts.google.com/person/c12345",
};

async function replicasWritten(): Promise<BatchEntityInput[]> {
  const batches: GraphBatchInput[] = [];
  let mintSeq = 0;
  const graph = mockGraph({
    apply_batch: (frag: GraphBatchInput) => {
      batches.push(frag);
      return Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
        created: frag.entities.length,
        updated: 0,
        links_added: frag.links?.length ?? 0,
        dropped_keys: [],
      });
    },
    list_links_for_entity: () => Promise.resolve([]),
    get_entities: () => Promise.resolve([]),
    get_entity: () => Promise.resolve(null),
    create_entity: (input: { schema_id: string; name: string }) =>
      Promise.resolve({ id: `hub-${mintSeq++}`, schema_id: input.schema_id, name: input.name }),
    add_link: () => Promise.resolve(undefined),
    list_entities: () => Promise.resolve({ items: [], total: 0 }),
  } as never);
  const mod = mountModule(ContactsModule, {
    graph,
    ctx: { extension_id: "contacts" },
    rpc: {
      execute: (method: string, params: unknown) =>
        method === "email.ensure_addresses"
          ? Promise.resolve({
              ids: (params as { items: { address: string }[] }).items.map((i) => `addr-${i.address}`),
            })
          : Promise.reject(new Error(`unexpected rpc: ${method}`)),
    } as never,
  }).module;
  await mod.ingest({
    command: "bootstrap",
    generation: "initial:r:1",
    envelopes: [{
      source_id: "google", surface: "contacts", account_id: "acct-1", user_id: "u1",
      kind: "snapshot", remote_id: "gpeople:abc123", payload: contactPayload,
      timestamp: "2026-03-14T09:00:00Z",
    }],
  });
  return batches.flatMap((b) => b.entities);
}

async function hubClaimsWritten(): Promise<Record<string, unknown>[]> {
  const written: Record<string, unknown>[] = [];
  const created = graphEntity(CONTACT_ID, "Alice Smith", { schema_id: CONTACT });
  let exists = false;
  const graph = mockGraph({
    get_entity: () => Promise.resolve(exists ? created : null),
    create_entity: () => { exists = true; return Promise.resolve(created); },
    update_properties: (input: { properties: Record<string, unknown> }) => {
      written.push(input.properties);
      return Promise.resolve(undefined);
    },
    add_link: () => Promise.resolve(undefined),
    list_links_for_entities: () => Promise.resolve([]),
    get_entities: () => Promise.resolve([]),
  } as never);
  const mod = mountModule(ContactsModule, {
    graph,
    rpc: { execute: vi.fn(() => Promise.resolve({ id: "address-1" })) },
  }).module;
  await mod.create({
    name: "Alice Smith",
    email: "alice@example.test",
    phone: "+15551234567",
    role: "Founder",
    client_id: CONTACT_ID,
  });
  return written;
}

describe("contacts declares what it writes", () => {
  it("every replica the ingest writes passes the replica's declaration", async () => {
    const written = await replicasWritten();
    const replicas = written.filter((e) => e.schema_id === "contacts.google_contact");
    expect(replicas.length).toBeGreaterThan(0);
    for (const replica of replicas) {
      expect(googleContact.safeParse(replica.properties ?? {}).error?.issues ?? []).toEqual([]);
    }
  });

  it("every curated claim the hub writes passes the hub's declaration", async () => {
    const records = await hubClaimsWritten();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(person.safeParse(record).error?.issues ?? []).toEqual([]);
    }
  });

  it("a profile fact on the hub is refused — it belongs to the replica", () => {
    const verdict = person.safeParse({ role: "Founder", photo_url: "https://x/y.jpg" });
    expect(verdict.success).toBe(false);
    expect(JSON.stringify(verdict.error?.issues)).toContain("photo_url");
  });
});
