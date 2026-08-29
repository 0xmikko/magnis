/**
 * tst_fe_meetings_expand_001 — meetingHasMore false when only title/time/location.
 * tst_fe_meetings_expand_002 — meetingHasMore true for attendees/agenda/description.
 * tst_fe_meetings_expand_003 — MeetingCard expanded layout renders the rows.
 * tst_fe_meetings_expand_004 — Chevron flips MeetingCard via context.
 */
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { MeetingCard, meetingHasMore } from "../EntityCards";
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

describe("tst_fe_meetings_expand_001/002 — meetingHasMore", () => {
  it("false when only title/time/location", () => {
    expect(meetingHasMore({ title: "Standup", date: "2026-05-12", time: "10:00", location: "Office" })).toBe(false);
  });
  it("true with attendees", () => {
    expect(
      meetingHasMore({
        attendees: [
          { name: "Anna", email: "anna@x.test" },
          { name: "Boris", email: "boris@x.test" },
        ],
      }),
    ).toBe(true);
  });
  it("true with agenda or description", () => {
    expect(meetingHasMore({ agenda: "Discuss roadmap" })).toBe(true);
    expect(meetingHasMore({ description: "Internal sync" })).toBe(true);
  });
});

describe("tst_fe_meetings_expand_003 — MeetingCard expanded layout", () => {
  it("renders When/Location/Attendees/Agenda rows when expanded=true", () => {
    const runtime = mockRuntime(null);
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: true }}>
        <MeetingCard
          schemaId="meetings.calendar_event"
          data={{
            title: "Standup",
            date: "2026-05-12",
            time: "10:00",
            location: "Office",
            attendees: [
              { name: "Anna", email: "anna@x.test" },
              { name: "Boris", email: "boris@x.test" },
            ],
            agenda: "Discuss roadmap",
          }}
          runtime={runtime}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("2026-05-12 · 10:00")).toBeTruthy();
    expect(getByText("Office")).toBeTruthy();
    expect(getByText("Anna, Boris")).toBeTruthy();
    expect(getByText("Discuss roadmap")).toBeTruthy();
  });
});

describe("tst_fe_meetings_expand_005 — the GENERIC card renders from dictionary + edges", () => {
  it("derives title/when from the flattened dictionary and attendees from attendee edges", () => {
    const runtime = mockRuntime(null);
    // What the chokepoint hands a renderer for a folded meeting: the node's
    // dictionary FLAT at the root, the attendee EDGES under neighbours.
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: true }}>
        <MeetingCard
          schemaId="meetings.calendar_event"
          data={{
            name: "Standup",
            starts_at: "2026-05-12T10:00:00Z",
            location: "Office",
            neighbours: [
              {
                kind: "attendee",
                name: "anna@x.test",
                schema_id: "email.address",
                metadata: { display_name: "Anna" },
              },
              { kind: "attendee", name: "boris@x.test", schema_id: "email.address" },
              { kind: "created_by", name: "Project X", schema_id: "projects.project" },
            ],
          }}
          runtime={runtime}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("2026-05-12 · 10:00:00")).toBeTruthy();
    expect(getByText("Office")).toBeTruthy();
    expect(getByText("Anna, boris@x.test")).toBeTruthy();
  });
});

describe("tst_fe_meetings_expand_004 — chevron flips MeetingCard via context", () => {
  it("renders attendees row only after clicking the chevron", () => {
    const registration: EntityRendererRegistration = {
      id: "meetings-calendar_event",
      moduleId: "meetings",
      schemaMatch: "meetings.calendar_event",
      Render: MeetingCard,
      hasMore: (d) => meetingHasMore(d),
    };
    const runtime = mockRuntime(registration);
    const { getByTestId, queryByText, getByText } = render(
      <ExpandableEntityCard
        schemaId="meetings.calendar_event"
        data={{
          title: "Standup",
          attendees: [
            { name: "Anna", email: "anna@x.test" },
            { name: "Boris", email: "boris@x.test" },
          ],
        }}
        runtime={runtime}
      />,
    );
    expect(queryByText("Anna, Boris")).toBeNull();
    act(() => { fireEvent.click(getByTestId("expand-chevron")); });
    expect(getByText("Anna, Boris")).toBeTruthy();
  });
});
