/** The declaration is not a wish: the card this module's ingest writes has to
 * pass it, through the module's REAL path rather than a copied record.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { describe, expect, it } from "vitest";
import type { BatchEntityInput, GraphBatchInput } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, sourceEnvelope } from "@magnis/testkit/module";

import { AddressbookModule } from "./module/service.ts";
import { card } from "./entities.ts";
import { CARD } from "./schema.ts";

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

async function cardsWritten(): Promise<BatchEntityInput[]> {
  const batches: GraphBatchInput[] = [];
  const graph = mockGraph({
    apply_batch: (frag: GraphBatchInput) => {
      batches.push(frag);
      return Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
        created: frag.entities.length,
        updated: 0,
        links_added: 0,
        dropped_keys: [],
      });
    },
    list_links_for_entity: () => Promise.resolve([]),
    create_entity: (input: { schema_id: string; name: string }) =>
      Promise.resolve({ id: "hub-0", schema_id: input.schema_id, name: input.name }),
    add_link: () => Promise.resolve(undefined),
  } as never);
  const mod = mountModule(AddressbookModule, { graph, ctx: { extension_id: "addressbook" } }).module;
  await mod.ingest({
    command: "bootstrap",
    generation: "initial:r:1",
    envelopes: [sourceEnvelope("addressbook", contactPayload, {
      source_id: "google", account_id: "acct-1", user_id: "u1", remote_id: "gpeople:abc123",
      timestamp: "2026-03-14T09:00:00Z",
    })],
  });
  return batches.flatMap((b) => b.entities);
}

describe("addressbook declares what it writes", () => {
  it("every card the ingest writes passes the card's declaration", async () => {
    const cards = (await cardsWritten()).filter((e) => e.schema_id === CARD);
    expect(cards.length).toBeGreaterThan(0);
    for (const written of cards) {
      expect(card.safeParse(written.properties ?? {}).error?.issues ?? []).toEqual([]);
    }
  });
});
