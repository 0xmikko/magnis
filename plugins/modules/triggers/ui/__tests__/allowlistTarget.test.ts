/** The allowlist target this module canonicalises.
 *
 * Moved here from the host (`frontend/src/agent/__tests__/moduleAllowlistTargets.test.ts`),
 * which asserted all four modules at once by importing their UIs through a
 * submodule checkout. The rule is per-module and changes when the module
 * changes: a trigger creates future work on the user's behalf, so its create
 * is grantable and its list is not.
 *
 * The host keeps what is the host's — that `AgentContributionRegistry` asks
 * every contribution in turn and takes the first answer.
 *
 * @scenario: scn_agent_allowlist_002
 * @deterministic: yes
 */
import { describe, expect, it } from "vitest";

import { TriggersModule } from "../index";

interface AllowlistTargetLike {
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly targetLabel: string;
}

function target(name: string): AllowlistTargetLike | null {
  const contribution = TriggersModule.agent as
    | {
        extractAllowlistTarget?: (call: {
          name: string;
          args: unknown;
        }) => AllowlistTargetLike | null;
      }
    | undefined;
  return contribution?.extractAllowlistTarget?.({ name, args: {} }) ?? null;
}

describe("triggers allowlist target", () => {
  it("tst_fe_allowlist_target_003 canonicalizes trigger create aliases only", () => {
    /** @test-id: tst_fe_allowlist_target_003
     *  @covers: plugins/modules/triggers/ui/index.tsx */
    expect(target("triggers.create")).toEqual({
      action: "triggers.create",
      targetType: "tool_action",
      targetId: "triggers.create",
      targetLabel: "Create trigger",
    });
    expect(target("triggers_create")).toEqual(target("triggers.create"));
    expect(target("triggers.list")).toBeNull();
  });
});
