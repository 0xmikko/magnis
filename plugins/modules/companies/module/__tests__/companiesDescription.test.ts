/**
 * @layer: module
 * @test-id: tst_mod_companies_description_001
 * @scenario: scn_companies_description_update_001
 * @covers: plugins/modules/companies/module/service.ts::CompaniesModule.update
 * @deterministic: yes
 * @fixtures: inline company and summary-only update
 *
 * Test environment: CompaniesModule with a scripted GraphService.
 * Clients: direct calls.
 * Mocks: GraphService only.
 * Data: one existing company and a summary-only update.
 */
import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule } from "@magnis/testkit/module";

import { COMPANY, COMPANY_DETAILS } from "../../schema.ts";
import type { CompanyCanonical, CompanyFacets } from "../../types.ts";
import { CompaniesModule } from "../service.ts";

const COMPANY_DESCRIPTION = "companies.description";

function writeGraph() {
  const company = entity("company-1", "Acme Labs", { schema_id: COMPANY });
  return {
    company,
    graph: mockGraph<CompanyFacets, CompanyCanonical>({
      get_entity: () => Promise.resolve(company),
      create_entity: () => Promise.resolve(company),
      search_entities_by_name: () => Promise.resolve([]),
      update_entity_name: () => Promise.resolve(),
      update_properties: () => Promise.resolve(),
      get_entity_full: () =>
        Promise.resolve({
          entity: company,
          facets: [],
          links: [],
        }),
    }),
  };
}

describe("companies description write contract", () => {
  it("tst_mod_companies_description_001 writes the update summary to the hub's description key", async () => {
    const { company, graph } = writeGraph();
    const module = mountModule(CompaniesModule, {
      graph,
      ctx: { extension_id: "companies" },
    }).module;

    await module.update({
      id: company.id,
      summary: "Updated company description",
    });

    // S5: ONE dictionary merge carries the description — there is no second
    // copy of it anywhere, and no facet is written at all.
    const updateProperties = graph.spies.update_properties;
    if (updateProperties === undefined) {
      throw new Error("companies update: missing update_properties spy");
    }
    expect(updateProperties).toHaveBeenCalledTimes(1);
    expect(updateProperties).toHaveBeenCalledWith({
      entity_id: company.id,
      properties: { description: "Updated company description" },
    });
    expect(graph.spies.attach_facet).toBeUndefined();
  });

  /**
   * @test-id: tst_mod_companies_description_002
   * @scenario: scn_companies_description_create_001
   * @covers: plugins/modules/companies/module/service.ts::CompaniesModule.create
   * @deterministic: yes
   * @fixtures: inline company and create request with summary
   *
   * Test environment: CompaniesModule with a scripted GraphService.
   * Clients: direct calls.
   * Mocks: GraphService only.
   * Data: one new company with a summary.
   */
  it("tst_mod_companies_description_002 writes the create summary to the hub's description key", async () => {
    const { company, graph } = writeGraph();
    const module = mountModule(CompaniesModule, {
      graph,
      ctx: { extension_id: "companies" },
    }).module;

    await module.create({
      name: company.name,
      summary: "Initial company description",
    });

    const updateProperties = graph.spies.update_properties;
    if (updateProperties === undefined) {
      throw new Error("companies create: missing update_properties spy");
    }
    expect(updateProperties).toHaveBeenCalledWith({
      entity_id: company.id,
      properties: { name: company.name, description: "Initial company description" },
    });
    expect(graph.spies.attach_facet).toBeUndefined();
  });
});
