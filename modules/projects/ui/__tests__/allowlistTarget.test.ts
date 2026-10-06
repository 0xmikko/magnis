/**
 * @test-id: tst_fe_allowlist_target_004
 * @scenario: scn_agent_allowlist_002
 * @covers: modules/projects/ui/index.tsx
 * @deterministic: yes
 * @fixtures: validated local and foreign bindings
 */
import { describe, expect, it } from "vitest";
import { ProjectsModule } from "../index";

describe("projects allowlist identity", () => {
  const extract = ProjectsModule.agent.extractAllowlistTarget;
  if (!extract) throw new Error("allowlist extractor missing");
  it("grants only supported validated pairs", () => {
    for (const operation of ["create", "update"]) {
      const action = `projects.project.${operation}`;
      expect(extract({ name: operation, args: {}, toolBinding: { entity: "projects.project", operation } })).toEqual({ action, targetType: "tool_action", targetId: action, targetLabel: `${operation === "create" ? "Create" : operation === "merge" ? "Merge" : "Update"} project` });
      expect(extract({ name: operation, args: {}, toolBinding: { entity: "other.entity", operation } })).toBeNull();
    }
    expect(extract({ name: "projects.create", args: {} })).toBeNull();
    expect(extract({ name: "get", args: {}, toolBinding: { entity: "projects.project", operation: "get" } })).toBeNull();
  });
});
