/**
 * @layer: module
 * @test-id: tst_module_companies_write_001
 * @scenario: scn_companies_write_001
 * @covers: plugins/modules/companies/module/service.ts::create,update
 * @deterministic: yes
 * @fixtures: fixed company entities and strict graph/RPC doubles
 * @legacy-id: tst_companies_write_create_persists_and_reads_back
 */
import { describe, expect, it, vi } from "vitest";
import { entity, mockGraph, mountModule } from "@magnis/testkit/module";
import { COMPANY } from "../../schema.ts";
import { CompaniesModule } from "../service.ts";

const COMPANY_ID = "55555555-5555-4555-8555-555555555555";

function company(name: string, properties: Record<string, unknown> = {}) {
  return entity(COMPANY_ID, name, { schema_id: COMPANY, properties });
}

describe("tst_module_companies_write_001 — company write contract", () => {
  it("creates the entity, derives domain fields, and returns persisted dictionary data", async () => {
    const persisted = company("New Co", {
      name: "New Co",
      domain: "new.example",
      website: "https://new.example",
      industry: "AI",
      description: "Local-first operations",
    });
    const graph = mockGraph({
      search_entities_by_name: () => Promise.resolve([]),
      create_entity: () => Promise.resolve(company("New Co")),
      update_properties: () => Promise.resolve(undefined),
      get_entity: () => Promise.resolve(persisted),
    });
    const module = mountModule(CompaniesModule, { graph }).module;

    const result = await module.create({
      name: "New Co",
      domain: "new.example",
      industry: "AI",
      summary: "Local-first operations",
      client_id: COMPANY_ID,
    });

    expect(result).toMatchObject({
      id: COMPANY_ID,
      name: "New Co",
      website: "https://new.example",
      industry: "AI",
    });
    expect(graph.spies.create_entity).toHaveBeenCalledWith({
      schema_id: COMPANY,
      name: "New Co",
      client_id: COMPANY_ID,
      idx: "new co",
    });
    expect(graph.spies.update_properties).toHaveBeenCalledWith({
      entity_id: COMPANY_ID,
      properties: {
        name: "New Co",
        domain: "new.example",
        website: "https://new.example",
        industry: "AI",
        description: "Local-first operations",
      },
    });
  });

  it("returns an exact case-insensitive name match without writing", async () => {
    const existing = company(" ACME ", { website: "https://acme.example" });
    const graph = mockGraph({
      search_entities_by_name: () => Promise.resolve([existing]),
    });
    const module = mountModule(CompaniesModule, { graph }).module;

    await expect(module.create({ name: "acme" })).resolves.toMatchObject({
      id: COMPANY_ID,
      website: "https://acme.example",
    });
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledWith({
      query: "acme",
      schema_ids: [COMPANY],
      limit: 25,
    });
  });

  it("merges provided enrichment and links email identities", async () => {
    const original = company("Old Co");
    const updated = company("New Co", {
      name: "New Co",
      domain: "new.example",
      website: "https://new.example",
      phones: [{ phone: "+31000000001", type: null, is_primary: true }],
    });
    let readCount = 0;
    const graph = mockGraph({
      get_entity: () => Promise.resolve(readCount++ === 0 ? original : updated),
      update_entity_name: () => Promise.resolve(undefined),
      update_properties: () => Promise.resolve(undefined),
      add_link: () => Promise.resolve(undefined),
      get_entity_full: () => Promise.resolve({ entity: updated, links: [] }),
    });
    const execute = vi.fn(() => Promise.resolve({ ids: ["address-1"] }));
    const module = mountModule(CompaniesModule, { graph, rpc: { execute } }).module;

    const result = await module.update({
      id: COMPANY_ID,
      name: "New Co",
      domain: "new.example",
      phones: ["+31000000001"],
      emails: ["demo@new.example"],
    });

    expect(result).toMatchObject({ name: "New Co", website: "https://new.example" });
    expect(graph.spies.update_properties).toHaveBeenCalledWith({
      entity_id: COMPANY_ID,
      properties: {
        name: "New Co",
        domain: "new.example",
        website: "https://new.example",
        phones: [{ phone: "+31000000001", type: null, is_primary: true }],
      },
    });
    expect(graph.spies.add_link).toHaveBeenCalledWith({
      from_id: COMPANY_ID,
      to_id: "address-1",
      kind: "identity",
    });
  });

  it("propagates a dictionary write failure and does not fake a readback", async () => {
    const graph = mockGraph({
      search_entities_by_name: () => Promise.resolve([]),
      create_entity: () => Promise.resolve(company("Broken")),
      update_properties: () => Promise.reject(new Error("dictionary unavailable")),
    });
    const module = mountModule(CompaniesModule, { graph }).module;

    await expect(module.create({ name: "Broken" })).rejects.toThrow("dictionary unavailable");
  });
});
