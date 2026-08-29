/** The allowlist target this module canonicalises.
 *
 * Moved here from the host (`frontend/src/agent/__tests__/moduleAllowlistTargets.test.ts`),
 * which asserted all four modules at once by importing their UIs through a
 * submodule checkout. The rule is per-module and changes when the module
 * changes: create, batch_create and merge are SEPARATE grants — allowing one
 * must not silently allow the others.
 *
 * The host keeps what is the host's — that `AgentContributionRegistry` asks
 * every contribution in turn and takes the first answer.
 *
 * @scenario: scn_agent_allowlist_002
 * @deterministic: yes
 */
import { describe, expect, it } from "vitest";

import { ContactsModule } from "../index";

interface AllowlistTargetLike {
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly targetLabel: string;
}

function target(name: string): AllowlistTargetLike | null {
  const contribution = ContactsModule.agent as
    | {
        extractAllowlistTarget?: (call: {
          name: string;
          args: unknown;
        }) => AllowlistTargetLike | null;
      }
    | undefined;
  return contribution?.extractAllowlistTarget?.({ name, args: {} }) ?? null;
}

describe("contacts allowlist target", () => {
  it("tst_fe_allowlist_target_002 canonicalizes contact write aliases separately", () => {
    /** @test-id: tst_fe_allowlist_target_002
     *  @covers: plugins/modules/contacts/ui/index.tsx */
    expect(target("contacts_create")?.action).toBe("contacts.create");
    expect(target("contact.create")?.targetId).toBe("contacts.create");
    // Distinct grants: approving one contact create is not approving a batch,
    // and neither is approving a merge — which destroys a record.
    expect(target("contacts.batch_create")?.action).toBe("contacts.batch_create");
    expect(target("contacts_merge")?.action).toBe("contacts.merge");
    expect(target("contacts.list")).toBeNull();
  });
});
