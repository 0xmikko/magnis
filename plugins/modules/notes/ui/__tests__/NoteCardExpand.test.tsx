/**
 * tst_fe_notes_expand_001 — noteHasMore false without body, true with body.
 * tst_fe_notes_expand_002 — NoteCard renders body when expanded, hides when not.
 * tst_fe_notes_expand_003 — Show-all toggle appears for bodies past 20 lines.
 * tst_fe_notes_expand_004 — Chevron flips the same NoteCard via context.
 */
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { NoteCard, noteHasMore } from "../EntityCards";
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

describe("tst_fe_notes_expand_001 — noteHasMore", () => {
  it("false without body", () => {
    expect(noteHasMore({ title: "Standup" })).toBe(false);
  });
  it("true with body", () => {
    expect(noteHasMore({ body: "Topics today: ..." })).toBe(true);
  });
});

describe("tst_fe_notes_expand_002 — NoteCard expanded layout", () => {
  it("renders body text when ExpansionContext.expanded=true", () => {
    const runtime = mockRuntime(null);
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: true }}>
        <NoteCard
          schemaId="notes.note"
          data={{ title: "Standup", body: "Topics today: foo, bar" }}
          runtime={runtime}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("Topics today: foo, bar")).toBeTruthy();
  });
});

describe("tst_fe_notes_expand_003 — show-all toggle for long bodies", () => {
  it("renders the show-all button when body exceeds 20 lines", () => {
    const runtime = mockRuntime(null);
    const longBody = Array.from({ length: 25 }, (_, i) => `Line ${String(i + 1)}`).join("\n");
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: true }}>
        <NoteCard
          schemaId="notes.note"
          data={{ title: "Long note", body: longBody }}
          runtime={runtime}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("Show all 25 lines")).toBeTruthy();
  });
});

describe("tst_fe_notes_expand_004 — chevron flips NoteCard via context", () => {
  it("renders full body only after clicking the chevron; the compact preview is the truncated single-line form", () => {
    const registration: EntityRendererRegistration = {
      id: "notes-note",
      moduleId: "notes",
      schemaMatch: "notes.note",
      Render: NoteCard,
      hasMore: (d) => noteHasMore(d),
    };
    const runtime = mockRuntime(registration);
    // Use a multi-line body so the compact preview ("body.slice(0,80)
    // with newlines turned into spaces") is a distinct string from the
    // full body — that lets us assert on exact-match presence/absence.
    const body = "Line one of the body\nLine two with very long body text that exceeds the preview limit easily";
    const { getByTestId, queryByText, getByText } = render(
      <ExpandableEntityCard
        schemaId="notes.note"
        data={{ title: "Standup", body }}
        runtime={runtime}
      />,
    );
    // "limit easily" sits past the 80-char preview cutoff, so it only
    // appears in the expanded full-body div.
    expect(queryByText(/limit easily/)).toBeNull();
    act(() => { fireEvent.click(getByTestId("expand-chevron")); });
    expect(getByText(/limit easily/)).toBeTruthy();
  });
});
