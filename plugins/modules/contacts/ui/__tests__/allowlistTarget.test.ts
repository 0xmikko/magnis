/**
 * @test-id: tst_fe_allowlist_target_002
 * @scenario: scn_agent_allowlist_002
 * @covers: plugins/modules/contacts/ui/index.tsx
 * @deterministic: yes
 * @fixtures: validated local and foreign bindings
 */
import { describe, expect, it } from "vitest";
import { ContactsModule } from "../index";

describe("contacts allowlist identity", () => {
  const extract = ContactsModule.agent.extractAllowlistTarget;
  if (!extract) throw new Error("allowlist extractor missing");
  it("grants only supported validated pairs", () => {
    for (const operation of ["create", "merge"]) {
      const action = `contacts.person.${operation}`;
      expect(extract({ name: operation, args: {}, toolBinding: { entity: "contacts.person", operation } })).toEqual({ action, targetType: "tool_action", targetId: action, targetLabel: `${operation === "create" ? "Create" : operation === "merge" ? "Merge" : "Update"} contact` });
      expect(extract({ name: operation, args: {}, toolBinding: { entity: "other.entity", operation } })).toBeNull();
    }
    expect(extract({ name: "contacts.create", args: {} })).toBeNull();
    expect(extract({ name: "merge", args: { preview: true }, toolBinding: { entity: "contacts.person", operation: "merge" } })).toBeNull();
    expect(extract({ name: "get", args: {}, toolBinding: { entity: "contacts.person", operation: "get" } })).toBeNull();
  });
});
