/** The declaration is not a wish: the dictionary this module writes has to
 * pass it, through the module's REAL create path rather than a copied record.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { describe, expect, it } from "vitest";
import type { JsonValue } from "@magnis/sdk";
import { entity as graphEntity, mockGraph, mountModule, page } from "@magnis/testkit/module";

import { CompaniesModule } from "./module/service.ts";
import { company } from "./entities.ts";
import { COMPANY } from "./schema.ts";

async function writtenProperties(): Promise<JsonValue[]> {
  const written: JsonValue[] = [];
  const existing = graphEntity("company-1", "Acme Labs", { schemaId: COMPANY });
  const graph = mockGraph({
    getEntity: () => Promise.resolve(existing),
    createEntity: () => Promise.resolve(existing),
    searchEntitiesByName: () => Promise.resolve([]),
    listEntitiesWindow: () => Promise.resolve(page([existing])),
    getEntities: () => Promise.resolve([existing]),
    updateEntityName: () => Promise.resolve(undefined),
    addLink: () => Promise.resolve(undefined),
    getEntityFull: () => Promise.resolve({ entity: existing, links: [] }),
    updateProperties: (input: { properties: JsonValue }) => {
      written.push(input.properties);
      return Promise.resolve(undefined);
    },
  } as never);
  const mod = mountModule(CompaniesModule, { graph, ctx: { extensionId: "companies" } }).module;
  await mod.create({
    name: "Acme Labs",
    domain: "acme.example",
    industry: "manufacturing",
    summary: "Makes things.",
  });
  return written;
}

describe("companies declares what it writes", () => {
  it("every record the module writes today passes its own declaration", async () => {
    const records = await writtenProperties();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(company.safeParse(record).error?.issues ?? []).toEqual([]);
    }
  });

  it("a field the module does not declare is refused, and the error names it", () => {
    const verdict = company.safeParse({ name: "Acme Labs", ticker: "ACME" });
    expect(verdict.success).toBe(false);
    expect(JSON.stringify(verdict.error?.issues)).toContain("ticker");
  });
});
