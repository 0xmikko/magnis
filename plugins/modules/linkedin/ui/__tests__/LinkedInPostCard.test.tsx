// tst_fe_linkedin_card_001 — LinkedInPostCard renders author, text and metrics.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { LinkedInPostCard } from "../EntityCards";
import { ExpansionContext } from "@magnis/host/agent";
import type { AppRuntime } from "@magnis/host/runtime";

function mockRuntime(): AppRuntime {
  return {
    agent: { resolveEntityRenderer: () => null },
    transport: { rpc: vi.fn() },
    modules: { get: () => undefined },
  } as unknown as AppRuntime;
}

describe("LinkedInPostCard", () => {
  it("renders handle, text and metrics", () => {
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: false }}>
        <LinkedInPostCard
          schemaId="linkedin.post"
          data={{
            platform: "linkedin",
            author_handle: "anndoe",
            text: "shipping the linkedin module",
            created_at: "2026-06-01T00:00:00Z",
            metrics: { likes: 10, reposts: 1, replies: 2 },
          }}
          runtime={mockRuntime()}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("anndoe")).toBeTruthy();
    expect(getByText("shipping the linkedin module")).toBeTruthy();
    expect(getByText(/👍 10/)).toBeTruthy();
  });
});
