/** The allowlist target this module canonicalises.
 *
 * Moved here from the host (`frontend/src/agent/__tests__/moduleAllowlistTargets.test.ts`),
 * which asserted all four modules at once by importing their UIs through a
 * submodule checkout. The rule is per-module and changes when the module
 * changes: every spelling the agent emits for a company create must land on
 * one grant, and a read must never ask for one.
 *
 * The host keeps what is the host's — that `AgentContributionRegistry` asks
 * every contribution in turn and takes the first answer.
 *
 * @scenario: scn_agent_allowlist_002
 * @deterministic: yes
 */
import { describe, expect, it } from "vitest";

import { CompaniesModule } from "../index";

interface AllowlistTargetLike {
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly targetLabel: string;
}

function target(name: string): AllowlistTargetLike | null {
  const contribution = CompaniesModule.agent as
    | {
        extractAllowlistTarget?: (call: {
          name: string;
          args: unknown;
        }) => AllowlistTargetLike | null;
      }
    | undefined;
  return contribution?.extractAllowlistTarget?.({ name, args: {} }) ?? null;
}

describe("companies allowlist target", () => {
  it("tst_fe_allowlist_target_001 canonicalizes company create aliases only", () => {
    /** @test-id: tst_fe_allowlist_target_001
     *  @covers: plugins/modules/companies/ui/index.tsx */
    for (const name of [
      "companies.create",
      "companies_create",
      "company.create",
      "company_create",
    ]) {
      expect(target(name), name).toEqual({
        action: "companies.create",
        targetType: "tool_action",
        targetId: "companies.create",
        targetLabel: "Create company",
      });
    }
    // A read is not a grantable action: allowlisting it would be a permission
    // the user never gave.
    expect(target("companies.list")).toBeNull();
  });
});
