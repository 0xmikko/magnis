/**
 * @layer: module
 * @test-id: tst_mod_companies_description_001
 * @scenario: scn_companies_description_update_001
 * @covers: modules/companies/module/service.ts::CompaniesModule.update
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
  const company = entity("company-1", "Acme Labs", { schemaId: COMPANY });
  return {
    company,
    graph: mockGraph({
      getEntity: () => Promise.resolve(company),
      createEntity: () => Promise.resolve(company),
      searchEntitiesByName: () => Promise.resolve([]),
      updateEntityName: () => Promise.resolve(),
      updateProperties: () => Promise.resolve(),
      addLink: () => Promise.resolve(undefined),
      getEntityFull: () =>
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
   * @covers: modules/companies/module/service.ts::CompaniesModule.update
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
      ctx: { extensionId: "companies" },
      rpc: { execute },
    }).module;

    await module.update({
      id: company.id,
      emails: ["a@acme.com", "b@acme.com"],
    });

    expect(execute).toHaveBeenCalledWith("email.ensure_addresses", {
      items: [{ address: "a@acme.com" }, { address: "b@acme.com" }],
    });
    const addLink = graph.spies.addLink;
    if (!addLink) throw new Error("addLink spy not mounted");
    expect(addLink.mock.calls.map(([p]) => p)).toEqual([
      { from: company.id, to: "addr-1", kind: "identity" },
      { from: company.id, to: "addr-2", kind: "identity" },
    ]);
  });

  it("tst_mod_companies_emails_002 an RPC failure propagates — no silent half-write", async () => {
    const { company, graph } = writeGraph();
    const execute = vi.fn(() => Promise.reject(new Error("email module down")));
    const module = mountModule(CompaniesModule, {
      graph,
      ctx: { extensionId: "companies" },
      rpc: { execute },
    }).module;

    await expect(
      module.update({ id: company.id, emails: ["a@acme.com"] }),
    ).rejects.toThrow(/email module down/);
    expect(graph.spies.addLink).not.toHaveBeenCalled();
  });
});

describe("companies description write contract", () => {
  it("tst_mod_companies_description_001 writes the update summary to the hub's description key", async () => {
    const { company, graph } = writeGraph();
    const module = mountModule(CompaniesModule, {
      graph,
      ctx: { extensionId: "companies" },
    }).module;

    await module.update({
      id: company.id,
      summary: "Updated company description",
    });

    // S5: ONE dictionary merge carries the description — there is no second
    // copy of it anywhere, and no record is written at all.
    const updateProperties = graph.spies.updateProperties;
    if (updateProperties === undefined) {
      throw new Error("companies update: missing updateProperties spy");
    }
    expect(updateProperties).toHaveBeenCalledTimes(1);
    expect(updateProperties).toHaveBeenCalledWith({
      entityId: company.id,
      properties: { description: "Updated company description" },
    });
    expect(graph.spies.attach_facet).toBeUndefined();
  });

  /**
   * @test-id: tst_mod_companies_description_002
   * @scenario: scn_companies_description_create_001
   * @covers: modules/companies/module/service.ts::CompaniesModule.create
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
      ctx: { extensionId: "companies" },
    }).module;

    await module.create({
      name: "Acme Labs",
      summary: "Initial company description",
    });

    const updateProperties = graph.spies.updateProperties;
    if (updateProperties === undefined) {
      throw new Error("companies create: missing updateProperties spy");
    }
    expect(updateProperties).toHaveBeenCalledWith({
      entityId: company.id,
      properties: { name: "Acme Labs", description: "Initial company description" },
    });
    expect(graph.spies.attach_facet).toBeUndefined();
  });
});
