/**
 * @test-id: tst_fe_allowlist_target_001
 * @scenario: scn_agent_allowlist_002
 * @covers: plugins/modules/companies/ui/index.tsx
 * @deterministic: yes
 * @fixtures: validated local and foreign bindings
 */
import { describe, expect, it } from "vitest";
import { CompaniesModule } from "../index";

describe("companies allowlist identity", () => {
  const extract = CompaniesModule.agent.extractAllowlistTarget;
  if (!extract) throw new Error("allowlist extractor missing");
  it("grants only supported validated pairs", () => {
    for (const operation of ["create", "update"]) {
      const action = `companies.company.${operation}`;
      expect(extract({ name: operation, args: {}, toolBinding: { entity: "companies.company", operation } })).toEqual({ action, targetType: "tool_action", targetId: action, targetLabel: `${operation === "create" ? "Create" : operation === "merge" ? "Merge" : "Update"} company` });
      expect(extract({ name: operation, args: {}, toolBinding: { entity: "other.entity", operation } })).toBeNull();
    }
    expect(extract({ name: "companies.create", args: {} })).toBeNull();
    expect(extract({ name: "get", args: {}, toolBinding: { entity: "companies.company", operation: "get" } })).toBeNull();
  });
});
