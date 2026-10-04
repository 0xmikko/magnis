/** The declaration is not a wish: the card this module's ingest writes has to
 * pass it, through the module's REAL path rather than a copied record.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { describe, expect, it } from "vitest";
import type { BatchEntityInput, GraphBatchInput, JsonObject } from "@magnis/sdk";
import { entity, mockGraph, mountModule, sourceEnvelope } from "@magnis/testkit/module";

import { AddressbookModule } from "./module/service.ts";
import { card } from "./entities.ts";
import { CARD } from "./schema.ts";

/** One Google connector Contact payload, as the ingest test spells it. */
const contactPayload: JsonObject = {
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
    findByExternalIds: (externalIds) => Promise.resolve(externalIds.map(() => null)),
    moduleSettings: () => Promise.resolve({ newSenderSyncEnabled: "true" }),
    applyBatch: (frag) => {
      batches.push(frag);
      return Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
        created: frag.entities.length,
        updated: 0,
        linksAdded: 0,
        droppedKeys: [], resolved: [],
      });
    },
    listLinksForEntity: () => Promise.resolve([]),
    createEntity: (input) => Promise.resolve(entity("hub-0", input.name, { schemaId: input.schemaId })),
    addLink: () => Promise.resolve(undefined),
  });
  const mod = mountModule(AddressbookModule, { graph, ctx: { extensionId: "addressbook" } }).module;
  await mod.ingest({
    command: "bootstrap",
    generation: "initial:r:1",
    envelopes: [sourceEnvelope("addressbook", contactPayload, {
      sourceId: "google", accountId: "acct-1", userId: "u1", remoteId: "gpeople:abc123",
      timestamp: "2026-03-14T09:00:00Z",
    })],
  });
  return batches.flatMap((b) => b.entities);
}

describe("addressbook declares what it writes", () => {
  it("every card the ingest writes passes the card's declaration", async () => {
    const cards = (await cardsWritten()).filter((e) => e.schemaId === CARD);
    expect(cards.length).toBeGreaterThan(0);
    for (const written of cards) {
      expect(card.safeParse(written.properties ?? {}).error?.issues ?? []).toEqual([]);
    }
  });
});
