// tst_fe_x_card_001 — XPostCard renders author, text, date and a metrics line
// from the merged x.post data the host passes.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { XPostCard } from "../EntityCards";
import { ExpansionContext } from "@magnis/host/agent";
import type { AppRuntime } from "@magnis/host/runtime";

function mockRuntime(): AppRuntime {
  return {
    agent: { resolveEntityRenderer: () => null },
    transport: { rpc: vi.fn() },
    modules: { get: () => undefined },
  } as unknown as AppRuntime;
}

describe("XPostCard", () => {
  it("renders @handle, text and metrics", () => {
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: false }}>
        <XPostCard
          schemaId="x.post"
          data={{
            platform: "x",
            author_handle: "jack",
            text: "shipping the x module",
            created_at: "2026-06-01T00:00:00Z",
            metrics: { likes: 5, reposts: 1, replies: 2 },
          }}
          runtime={mockRuntime()}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("@jack")).toBeTruthy();
    expect(getByText("shipping the x module")).toBeTruthy();
    expect(getByText(/♥ 5/)).toBeTruthy();
  });
});
