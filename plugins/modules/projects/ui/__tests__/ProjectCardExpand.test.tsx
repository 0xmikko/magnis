/**
 * tst_fe_projects_expand_001 — projectHasMore false without description.
 * tst_fe_projects_expand_002 — projectHasMore true with description.
 * tst_fe_projects_expand_003 — ProjectCard expanded layout renders description.
 * tst_fe_projects_expand_004 — Chevron flips the same ProjectCard via context.
 */
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { ProjectCard, projectHasMore } from "../EntityCards";
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

describe("tst_fe_projects_expand_001/002 — projectHasMore", () => {
  it("false without description", () => {
    expect(projectHasMore({ name: "Magnis" })).toBe(false);
  });
  it("true with description", () => {
    expect(projectHasMore({ description: "Local-first PRD" })).toBe(true);
  });
});

describe("tst_fe_projects_expand_003 — ProjectCard expanded layout", () => {
  it("renders the description when ExpansionContext.expanded=true", () => {
    const runtime = mockRuntime(null);
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: true }}>
        <ProjectCard
          schemaId="projects.project"
          data={{ name: "Magnis", description: "Local-first PRD" }}
          runtime={runtime}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("Local-first PRD")).toBeTruthy();
  });

  it("hides the description when ExpansionContext.expanded=false (default)", () => {
    const runtime = mockRuntime(null);
    const { queryByText } = render(
      <ProjectCard
        schemaId="projects.project"
        data={{ name: "Magnis", description: "Local-first PRD" }}
        runtime={runtime}
      />,
    );
    // Description is shown only as a truncated preview, not the full text.
    expect(queryByText("Local-first PRD", { exact: true, selector: "div" })).toBeNull();
  });
});

describe("tst_fe_projects_expand_004 — chevron flips ProjectCard via context", () => {
  it("renders description only after clicking the chevron", () => {
    const registration: EntityRendererRegistration = {
      id: "projects-project",
      moduleId: "projects",
      schemaMatch: "projects.project",
      Render: ProjectCard,
      hasMore: (d) => projectHasMore(d),
    };
    const runtime = mockRuntime(registration);
    const longDescription =
      "This is a longer description that won't fit into the truncated 80-char preview shown in the compact layout of ProjectCard.";
    const { getByTestId, queryByText, getByText } = render(
      <ExpandableEntityCard
        schemaId="projects.project"
        data={{ name: "Magnis", description: longDescription }}
        runtime={runtime}
      />,
    );
    expect(queryByText(longDescription)).toBeNull();
    act(() => { fireEvent.click(getByTestId("expand-chevron")); });
    expect(getByText(longDescription)).toBeTruthy();
  });
});
