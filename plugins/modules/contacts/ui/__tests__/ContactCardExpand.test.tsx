/**
 * tst_fe_contacts_expand_001 — contactHasMore false for bare name/email.
 * tst_fe_contacts_expand_002 — contactHasMore true when a facet-bearing field is present.
 * tst_fe_contacts_expand_003 — ContactCard expanded layout renders rows.
 * tst_fe_contacts_expand_004 — Chevron flips the same ContactCard via context.
 */
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { ContactCard, contactHasMore } from "../EntityCards";
import { ExpandableEntityCard } from "@magnis/host/agent";
import { ExpansionContext } from "@magnis/host/agent";
import type { AppRuntime } from "@magnis/host/runtime";
import type { EntityRendererRegistration } from "@magnis/host/runtime";

function mockRuntime(registration: EntityRendererRegistration | null): AppRuntime {
  return {
    agent: { resolveEntityRenderer: () => registration },
    transport: { rpc: vi.fn() },
    modules: { get: () => undefined },
  } as unknown as AppRuntime;
}

describe("tst_fe_contacts_expand_001/002 — contactHasMore", () => {
  it("false for name + email only", () => {
    expect(contactHasMore({ name: "Anna", email: "anna@x.com" })).toBe(false);
  });
  it("true when bio set", () => {
    expect(contactHasMore({ name: "Anna", bio: "designer" })).toBe(true);
  });
  it("true for multiple emails", () => {
    expect(contactHasMore({ emails: ["a@x.com", "b@x.com"] })).toBe(true);
  });
  it("true when aliases set", () => {
    expect(contactHasMore({ aliases: ["A", "B"] })).toBe(true);
  });
});

describe("tst_fe_contacts_expand_003 — ContactCard expanded layout", () => {
  it("renders Bio/Location/Telegram/Emails rows when ExpansionContext.expanded=true", () => {
    const runtime = mockRuntime(null);
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: true }}>
        <ContactCard
          schemaId="contacts.person"
          data={{
            name: "Anna",
            bio: "Designer",
            location: "Berlin",
            telegram: "@anna",
            emails: ["a@x.com", "b@x.com"],
          }}
          runtime={runtime}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("Designer")).toBeTruthy();
    expect(getByText("Berlin")).toBeTruthy();
    expect(getByText("@anna")).toBeTruthy();
    expect(getByText("a@x.com, b@x.com")).toBeTruthy();
  });
});

describe("tst_fe_contacts_expand_004 — chevron flips ContactCard via context", () => {
  it("renders Bio row only after clicking the chevron", () => {
    const registration: EntityRendererRegistration = {
      id: "contacts-person",
      moduleId: "contacts",
      schemaMatch: "contacts.person",
      Render: ContactCard,
      hasMore: (d) => contactHasMore(d),
    };
    const runtime = mockRuntime(registration);
    const { getByTestId, queryByText, getByText } = render(
      <ExpandableEntityCard
        schemaId="contacts.person"
        data={{ name: "Anna", bio: "Designer" }}
        runtime={runtime}
      />,
    );
    expect(queryByText("Designer")).toBeNull();
    act(() => { fireEvent.click(getByTestId("expand-chevron")); });
    expect(getByText("Designer")).toBeTruthy();
  });
});
