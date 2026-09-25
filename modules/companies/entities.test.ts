/** The declaration is not a wish: the dictionary this module writes has to
 * pass it, through the module's REAL create path rather than a copied record.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { describe, expect, it } from "vitest";
import { entity as graphEntity, mockGraph, mountModule } from "@magnis/testkit/module";

import { CompaniesModule } from "./module/service.ts";
import { company } from "./entities.ts";
import { COMPANY } from "./schema.ts";

async function writtenProperties(): Promise<Record<string, unknown>[]> {
  const written: Record<string, unknown>[] = [];
  const existing = graphEntity("company-1", "Acme Labs", { schema_id: COMPANY });
  const graph = mockGraph({
    get_entity: () => Promise.resolve(existing),
    create_entity: () => Promise.resolve(existing),
    search_entities_by_name: () => Promise.resolve([]),
    list_entities_window: () => Promise.resolve({ items: [existing], total: 1 }),
    get_entities: () => Promise.resolve([existing]),
    update_entity_name: () => Promise.resolve(undefined),
    add_link: () => Promise.resolve(undefined),
    get_entity_full: () => Promise.resolve({ entity: existing, links: [] }),
    update_properties: (input: { properties: Record<string, unknown> }) => {
      written.push(input.properties);
      return Promise.resolve(undefined);
    },
  } as never);
  const mod = mountModule(CompaniesModule, { graph, ctx: { extension_id: "companies" } }).module;
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
