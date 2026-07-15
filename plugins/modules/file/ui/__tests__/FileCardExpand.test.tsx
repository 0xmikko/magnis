/**
 * tst_fe_files_expand_001 — fileHasMore false for name+mime+size only.
 * tst_fe_files_expand_002 — fileHasMore true for preview_url/url/description/created_at.
 * tst_fe_files_expand_003 — FileCard expanded layout renders rows + download link.
 * tst_fe_files_expand_004 — Chevron flips the same FileCard via context.
 */
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { FileCard, fileHasMore } from "../EntityCards";
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

describe("tst_fe_files_expand_001/002 — fileHasMore", () => {
  it("false for name + mime + size only", () => {
    expect(fileHasMore({ name: "report.pdf", mime_type: "application/pdf", size_bytes: 1024 })).toBe(false);
  });
  it("true with preview_url", () => {
    expect(fileHasMore({ preview_url: "https://x/preview.png" })).toBe(true);
  });
  it("true with description", () => {
    expect(fileHasMore({ description: "Final draft" })).toBe(true);
  });
  it("true with created_at", () => {
    expect(fileHasMore({ created_at: "2026-05-12T10:00:00Z" })).toBe(true);
  });
});

describe("tst_fe_files_expand_003 — FileCard expanded layout", () => {
  it("renders meta rows and download link when expanded=true", () => {
    const runtime = mockRuntime(null);
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: true }}>
        <FileCard
          schemaId="file.object"
          data={{
            name: "report.pdf",
            mime_type: "application/pdf",
            size_bytes: 2048,
            description: "Final draft",
            created_at: "2026-05-12T10:00:00Z",
            url: "https://x/report.pdf",
          }}
          runtime={runtime}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("application/pdf")).toBeTruthy();
    expect(getByText("Final draft")).toBeTruthy();
    expect(getByText("Download")).toBeTruthy();
  });
});

describe("tst_fe_files_expand_004 — chevron flips FileCard via context", () => {
  it("renders description row only after clicking the chevron", () => {
    const registration: EntityRendererRegistration = {
      id: "file-object",
      moduleId: "file",
      schemaMatch: "file.object",
      Render: FileCard,
      hasMore: (d) => fileHasMore(d),
    };
    const runtime = mockRuntime(registration);
    const { getByTestId, queryByText, getByText } = render(
      <ExpandableEntityCard
        schemaId="file.object"
        data={{ name: "report.pdf", mime_type: "application/pdf", description: "Final draft" }}
        runtime={runtime}
      />,
    );
    expect(queryByText("Final draft")).toBeNull();
    act(() => { fireEvent.click(getByTestId("expand-chevron")); });
    expect(getByText("Final draft")).toBeTruthy();
  });
});
