/** The declaration is not a wish: the curated hub claims this module's create
 * writes have to pass it, through the module's REAL path rather than copied
 * records.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { describe, expect, it, vi } from "vitest";
import { entity as graphEntity, mockGraph, mountModule } from "@magnis/testkit/module";

import { ContactsModule } from "./module/service.ts";
import { person } from "./entities.ts";
import { CONTACT } from "./schema.ts";

const CONTACT_ID = "44444444-4444-4444-8444-444444444444";

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
