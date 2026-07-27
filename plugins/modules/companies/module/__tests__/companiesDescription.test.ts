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
import { entity, facet, mockGraph, mountModule } from "@magnis/testkit/module";

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
      attach_facet: (input) =>
        Promise.resolve(
          facet("attached-facet", input.schema_id, input.data, {
            entity_id: input.entity_id,
          }),
        ),
      resolve_canonical: () => Promise.resolve(),
      get_canonical: () => Promise.resolve({}),
      get_entity_full: () =>
        Promise.resolve({
          entity: company,
          facets: [],
          links: [],
        }),
      list_facets_for_entity: () => Promise.resolve([]),
    }),
  };
}

describe("companies description write contract", () => {
  it("tst_mod_companies_description_001 writes update summary to the markdown description facet", async () => {
    const { company, graph } = writeGraph();
    const module = mountModule(CompaniesModule, {
      graph,
      ctx: { extension_id: "companies" },
    }).module;

    await module.update({
      id: company.id,
      summary: "Updated company description",
    });

    const attachFacet = graph.spies.attach_facet;
    if (attachFacet === undefined) throw new Error("companies update: missing attach_facet spy");
    expect(attachFacet).toHaveBeenCalledWith({
      entity_id: company.id,
      schema_id: COMPANY_DESCRIPTION,
      data: { body: "Updated company description" },
    });
    expect(attachFacet).not.toHaveBeenCalledWith(
      expect.objectContaining({
        schema_id: COMPANY_DETAILS,
        data: expect.objectContaining({ description: expect.anything() }),
      }),
    );
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
  it("tst_mod_companies_description_002 writes create summary to the markdown description facet", async () => {
    const { company, graph } = writeGraph();
    const module = mountModule(CompaniesModule, {
      graph,
      ctx: { extension_id: "companies" },
    }).module;

    await module.create({
      name: company.name,
      summary: "Initial company description",
    });

    const attachFacet = graph.spies.attach_facet;
    if (attachFacet === undefined) throw new Error("companies create: missing attach_facet spy");
    expect(attachFacet).toHaveBeenCalledWith({
      entity_id: company.id,
      schema_id: COMPANY_DESCRIPTION,
      data: { body: "Initial company description" },
    });
    expect(attachFacet).not.toHaveBeenCalledWith(
      expect.objectContaining({
        schema_id: COMPANY_DETAILS,
        data: expect.objectContaining({ description: expect.anything() }),
      }),
    );
  });
});
