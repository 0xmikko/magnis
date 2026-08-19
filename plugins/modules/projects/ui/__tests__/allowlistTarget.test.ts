/** The allowlist target this module canonicalises.
 *
 * Moved here from the host (`frontend/src/agent/__tests__/moduleAllowlistTargets.test.ts`),
 * which asserted all four modules at once by importing their UIs through a
 * submodule checkout. The rule is per-module and changes when the module
 * changes: create and update are each action-wide grants, and they are not
 * the same grant.
 *
 * The host keeps what is the host's — that `AgentContributionRegistry` asks
 * every contribution in turn and takes the first answer.
 *
 * @scenario: scn_agent_allowlist_002
 * @deterministic: yes
 */
import { describe, expect, it } from "vitest";

import { ProjectsModule } from "../index";

interface AllowlistTargetLike {
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly targetLabel: string;
}

function target(name: string): AllowlistTargetLike | null {
  const contribution = ProjectsModule.agent as
    | {
        extractAllowlistTarget?: (call: {
          name: string;
          args: unknown;
        }) => AllowlistTargetLike | null;
      }
    | undefined;
  return contribution?.extractAllowlistTarget?.({ name, args: {} }) ?? null;
}

describe("projects allowlist target", () => {
  it("tst_fe_allowlist_target_004 canonicalizes project creates and updates as action-wide grants", () => {
    /** @test-id: tst_fe_allowlist_target_004
     *  @covers: plugins/modules/projects/ui/index.tsx */
    for (const name of ["projects.create", "projects_create", "project.create", "project_create"]) {
      expect(target(name), name).toEqual({
        action: "projects.create",
        targetType: "tool_action",
        targetId: "projects.create",
        targetLabel: "Create project",
      });
    }
    for (const name of ["projects.update", "projects_update", "project.update", "project_update"]) {
      expect(target(name), name).toEqual({
        action: "projects.update",
        targetType: "tool_action",
        targetId: "projects.update",
        targetLabel: "Update project",
      });
    }
    expect(target("projects.list")).toBeNull();
  });
});
