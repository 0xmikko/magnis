/**
 * tst_fe_emails_expand_001 — emailHasMore false for sender/subject/preview only.
 * tst_fe_emails_expand_002 — emailHasMore true for body/recipients/attachments.
 * tst_fe_emails_expand_003 — EmailCard renders To/Attached/body when ExpansionContext.expanded=true.
 * tst_fe_emails_expand_004 — EmailCard hides expanded fields when expanded=false.
 * tst_fe_emails_expand_005 — Clicking the ExpandableEntityCard chevron flips the same EmailCard between layouts.
 *
 * Validates the "ONE COMPONENT PER ENTITY" rule (see
 * docs/frontend/module-standard.md) for emails: a SINGLE EmailCard renders
 * BOTH the compact and the expanded layouts by reading
 * `ExpansionContext.expanded`. There is no separate EmailCardExpanded.
 */
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { EmailCard, emailHasMore } from "../EntityCards";
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

describe("tst_fe_emails_expand_001/002 — emailHasMore", () => {
  it("false for sender/subject/preview only", () => {
    expect(
      emailHasMore({
        sender: "Anna",
        subject: "Hi",
        preview: "hello",
        timestamp: "2026-04-18T10:00:00Z",
      }),
    ).toBe(false);
  });
  it("true for body_text", () => {
    expect(emailHasMore({ body_text: "Full message" })).toBe(true);
  });
  it("true for recipients", () => {
    expect(emailHasMore({ to: "x@y.com" })).toBe(true);
  });
  it("true for attachments", () => {
    expect(emailHasMore({ attachments: [{ filename: "report.pdf" }] })).toBe(true);
  });
  it("true when only an id is present (lazy fetch will hydrate the body)", () => {
    expect(emailHasMore({ id: "email-1", subject: "Hi", sender: "Anna" })).toBe(true);
  });
});

describe("tst_fe_emails_expand_003 — EmailCard expanded layout", () => {
  it("renders To/Attached/body when ExpansionContext.expanded=true", () => {
    const runtime = mockRuntime(null);
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: true }}>
        <EmailCard
          schemaId="email.message"
          data={{
            subject: "Hi",
            sender: "Anna",
            to: "x@y.com",
            recipients: ["z@y.com"],
            attachments: [{ filename: "report.pdf" }, "notes.txt"],
            body_text: "Hello world",
          }}
          runtime={runtime}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("x@y.com, z@y.com")).toBeTruthy();
    expect(getByText("report.pdf, notes.txt")).toBeTruthy();
    expect(getByText("Hello world")).toBeTruthy();
  });
});

/** @test-id: tst_fe_emails_expand_006
 * @covers: plugins/modules/email/ui/EntityCards.tsx::EmailCard
 * @invariant: a stored message carries no recipient field; the card reads
 * its recipient from the sent_to edge `email.get` returns.
 * @deterministic: yes
 */
describe("tst_fe_emails_expand_006 — EmailCard recipient from the sent_to edge", () => {
  it("shows the recipient of an email.get detail", () => {
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: true }}>
        <EmailCard
          schemaId="email.message"
          data={{
            subject: "Report Q3",
            metadata: { from_address: "me@example.com", body_text: "see attached" },
            linked_entities: [{ link_kind: "sent_to", schema_id: "email.address", name: "ops@example.com" }],
          }}
          runtime={mockRuntime(null)}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("ops@example.com")).toBeTruthy();
  });
});

describe("tst_fe_emails_expand_004 — EmailCard compact layout (default)", () => {
  it("hides body/To/Attached when ExpansionContext.expanded=false (default)", () => {
    const runtime = mockRuntime(null);
    const { queryByText } = render(
      <EmailCard
        schemaId="email.message"
        data={{
          subject: "Hi",
          sender: "Anna",
          body_text: "Hello world",
        }}
        runtime={runtime}
      />,
    );
    expect(queryByText("Hello world")).toBeNull();
  });
});

describe("tst_fe_emails_expand_005 — chevron flips the same EmailCard via context", () => {
  it("renders the expanded layout only after clicking the chevron; the same component re-renders", () => {
    const registration: EntityRendererRegistration = {
      id: "email-message",
      moduleId: "email",
      schemaMatch: "email.message",
      Render: EmailCard,
      hasMore: (d) => emailHasMore(d),
    };
    const runtime = mockRuntime(registration);
    const { getByTestId, queryByText, getByText } = render(
      <ExpandableEntityCard
        schemaId="email.message"
        data={{ subject: "Hi", sender: "Anna", body_text: "Hello world" }}
        runtime={runtime}
      />,
    );
    expect(queryByText("Hello world")).toBeNull();
    act(() => {
      fireEvent.click(getByTestId("expand-chevron"));
    });
    expect(getByText("Hello world")).toBeTruthy();
  });
});
