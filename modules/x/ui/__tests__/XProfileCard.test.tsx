// tst_fe_x_profilecard_001: the x.profile
// entity card (rendered inside a contact's dynamic X tab) shows the identity —
// avatar, name, @handle · followers — not post content.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { XProfileCard } from "../EntityCards";
import { ExpansionContext } from "@magnis/host/agent";
import type { AppRuntime } from "@magnis/host/runtime";

function mockRuntime(): AppRuntime {
  return {
    agent: { resolveEntityRenderer: () => null },
    transport: { rpc: vi.fn() },
    modules: { get: () => undefined },
  } as unknown as AppRuntime;
}

describe("XProfileCard", () => {
  it("renders name, @handle · followers and the avatar", () => {
    const { getByText, getByAltText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: false }}>
        <XProfileCard
          schemaId="x.profile"
          data={{
            platform: "x",
            handle: "jack",
            display_name: "Jack",
            follower_count: 3628,
            avatar_url: "https://pbs.twimg.com/a.jpg",
            bio: "ceo",
          }}
          runtime={mockRuntime()}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("Jack")).toBeTruthy();
    expect(getByText(/@jack · 3,628 followers/)).toBeTruthy();
    expect(getByAltText("Jack")).toBeTruthy();
  });
});
