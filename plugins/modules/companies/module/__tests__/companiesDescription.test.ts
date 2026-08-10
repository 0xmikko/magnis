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
import { describe, expect, it, vi } from "vitest";
import { entity, mockGraph, mountModule } from "@magnis/testkit/module";

import { COMPANY, COMPANY_DETAILS } from "../../schema.ts";
import type { CompanyCanonical } from "../../types.ts";
import { CompaniesModule } from "../service.ts";

const COMPANY_DESCRIPTION = "companies.description";

function writeGraph() {
  const company = entity("company-1", "Acme Labs", { schema_id: COMPANY });
  return {
    company,
    graph: mockGraph<CompanyCanonical>({
      get_entity: () => Promise.resolve(company),
      create_entity: () => Promise.resolve(company),
      search_entities_by_name: () => Promise.resolve([]),
      update_entity_name: () => Promise.resolve(),
      update_properties: () => Promise.resolve(),
      add_link: () => Promise.resolve(undefined),
      get_entity_full: () =>
        Promise.resolve({
          entity: company,
          links: [],
        }),
    }),
  };
}

describe("companies.update emails — the cross-module identity path", () => {
  /**
   * @test-id: tst_mod_companies_emails_001
   * @covers: plugins/modules/companies/module/service.ts::CompaniesModule.update
   * @invariant: an email is an identity CHANNEL — the email module mints the
   * address nodes over ONE batched RPC and this module writes one `identity`
   * edge per returned id. The manifest grant for both is what this guards:
   * delete either permission and this call chain is denied at runtime.
   */
  it("tst_mod_companies_emails_001 mints addresses over RPC and writes identity edges", async () => {
    const { company, graph } = writeGraph();
    const execute = vi.fn((method: string) => {
      if (method === "email.ensure_addresses") {
        return Promise.resolve({ ids: ["addr-1", "addr-2"] });
      }
      throw new Error(`unexpected rpc ${method}`);
    });
    const module = mountModule(CompaniesModule, {
      graph,
      ctx: { extension_id: "companies" },
      rpc: { execute },
    }).module;

    await module.update({
      id: company.id,
      emails: ["a@acme.com", "b@acme.com"],
    });

    expect(execute).toHaveBeenCalledWith("email.ensure_addresses", {
      items: [{ address: "a@acme.com" }, { address: "b@acme.com" }],
    });
    const addLink = graph.spies.add_link;
    if (!addLink) throw new Error("add_link spy not mounted");
    expect(addLink.mock.calls.map(([p]) => p)).toEqual([
      { from_id: company.id, to_id: "addr-1", kind: "identity" },
      { from_id: company.id, to_id: "addr-2", kind: "identity" },
    ]);
  });

  it("tst_mod_companies_emails_002 an RPC failure propagates — no silent half-write", async () => {
    const { company, graph } = writeGraph();
    const execute = vi.fn(() => Promise.reject(new Error("email module down")));
    const module = mountModule(CompaniesModule, {
      graph,
      ctx: { extension_id: "companies" },
      rpc: { execute },
    }).module;

    await expect(
      module.update({ id: company.id, emails: ["a@acme.com"] }),
    ).rejects.toThrow(/email module down/);
    expect(graph.spies.add_link).not.toHaveBeenCalled();
  });
});

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
    // copy of it anywhere, and no record is written at all.
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
