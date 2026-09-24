/**
 * tst_fe_contacts_helpers_001 — mapContact propagates is_team_member → isTeamMember
 * tst_fe_contacts_helpers_002 — mapContact defaults isTeamMember to false when field omitted
 */
import { describe, expect, it } from "vitest";

import { mapContact } from "../helpers";
import type { ContactListItem } from "../types";

function baseItem(overrides: Partial<ContactListItem> = {}): ContactListItem {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Alex Park",
    email: "alex@helix.example",
    phone: null,
    role: "CTO",
    company: null,
    channels: ["Email"],
    avatar_color: "orange",
    initials: "AP",
    created_at: "2026-05-18T12:00:00Z",
    ...overrides,
  };
}

describe("mapContact / is_team_member", () => {
  it("tst_fe_contacts_helpers_001 — propagates true into camelCase isTeamMember", () => {
    const profile = mapContact(baseItem({ is_team_member: true }));
    expect(profile.isTeamMember).toBe(true);
  });

  it("tst_fe_contacts_helpers_002 — defaults to false when field omitted (sync-ingested contact)", () => {
    const profile = mapContact(baseItem());
    expect(profile.isTeamMember).toBe(false);
  });
});
