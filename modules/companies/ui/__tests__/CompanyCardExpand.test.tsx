/**
 * tst_fe_companies_expand_001 — companyHasMore false for bare name/industry.
 * tst_fe_companies_expand_002 — companyHasMore true for description/location/size/founded.
 * tst_fe_companies_expand_003 — CompanyCard expanded layout renders About + meta rows.
 * tst_fe_companies_expand_004 — Chevron flips the same CompanyCard via context.
 */
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { CompanyCard, companyHasMore } from "../EntityCards";
import { ExpandableEntityCard, ExpansionContext } from "@magnis/host/agent";
import type { AppRuntime, EntityRendererRegistration } from "@magnis/host/runtime";

function mockRuntime(registration: EntityRendererRegistration | null): AppRuntime {
  return {
    agent: { resolveEntityRenderer: () => registration },
    transport: { rpc: vi.fn() },
    modules: { get: () => undefined },
  } as unknown as AppRuntime;
}

describe("tst_fe_companies_expand_001/002 — companyHasMore", () => {
  it("false for name + industry only", () => {
    expect(companyHasMore({ name: "Acme", industry: "SaaS" })).toBe(false);
  });
  it("true when description set", () => {
    expect(companyHasMore({ name: "Acme", description: "We make widgets" })).toBe(true);
  });
  it("true when location/size/founded set", () => {
    expect(companyHasMore({ location: "Berlin" })).toBe(true);
    expect(companyHasMore({ size: "100-500" })).toBe(true);
    expect(companyHasMore({ founded: "2018" })).toBe(true);
  });
  it("true when both industry AND domain are present (industry alone would just be subtitle)", () => {
    expect(companyHasMore({ industry: "SaaS", domain: "acme.io" })).toBe(true);
  });
});

describe("tst_fe_companies_expand_003 — CompanyCard expanded layout", () => {
  it("renders About + meta rows when ExpansionContext.expanded=true", () => {
    const runtime = mockRuntime(null);
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: true }}>
        <CompanyCard
          schemaId="companies.company"
          data={{
            name: "Acme",
            description: "We make widgets",
            location: "Berlin",
            size: "100-500",
          }}
          runtime={runtime}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("We make widgets")).toBeTruthy();
    expect(getByText("Berlin")).toBeTruthy();
    expect(getByText("100-500")).toBeTruthy();
  });
});

describe("tst_fe_companies_expand_004 — chevron flips CompanyCard via context", () => {
  it("renders About row only after clicking the chevron", () => {
    const registration: EntityRendererRegistration = {
      id: "companies-company",
      moduleId: "companies",
      schemaMatch: "companies.company",
      Render: CompanyCard,
      hasMore: (d) => companyHasMore(d),
    };
    const runtime = mockRuntime(registration);
    const { getByTestId, queryByText, getByText } = render(
      <ExpandableEntityCard
        schemaId="companies.company"
        data={{ name: "Acme", description: "We make widgets" }}
        runtime={runtime}
      />,
    );
    expect(queryByText("We make widgets")).toBeNull();
    act(() => { fireEvent.click(getByTestId("expand-chevron")); });
    expect(getByText("We make widgets")).toBeTruthy();
  });
});
