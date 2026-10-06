// Existing profile facts remain read-only after tracking controls retire.
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { XProfileHeader } from "../ProfileHeader";
import type { AppRuntime } from "@magnis/host/runtime";

function mockRuntime(rpc: ReturnType<typeof vi.fn>): AppRuntime {
  return { transport: { rpc } } as unknown as AppRuntime;
}

function rpcMock() {
  return vi.fn(async (method: string, _params?: unknown) => {
    if (method === "x.profiles.get") {
      return {
        id: "e1",
        handle: "jack",
        display_name: "Jack",
        follower_count: 99,
        bio: "ceo",
        url: "https://x.com/jack",
      };
    }
    if (method === "contacts.get_social_tracking_by_handle") {
      return { contact_id: "c1", tracked: true, handle: "jack" };
    }

    throw new Error(`unexpected rpc ${method}`);
  });
}

function renderHeader(rpc: ReturnType<typeof vi.fn>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <XProfileHeader
        entityId="e1"
        entityName="Jack"
        moduleId="x"
        themeColor="blue"
        runtime={mockRuntime(rpc)}
      />
    </QueryClientProvider>,
  );
}

describe("XProfileHeader tracking control", () => {
  it("shows the Tracked badge for a tracked handle", async () => {
    const { findByText } = renderHeader(rpcMock());
    expect(await findByText("Tracked")).toBeTruthy();
  });

  it("profile actions offer only the existing external profile link", async () => {
    const rpc = rpcMock();
    const { findByText, findByLabelText, queryByText } = renderHeader(rpc);
    await findByText("Tracked");

    fireEvent.click(await findByLabelText("Profile actions"));
    expect(await findByText("Open profile")).toBeTruthy();
    expect(queryByText("Untrack on X")).toBeNull();
    expect(queryByText("Track on X")).toBeNull();
    expect(rpc.mock.calls.every(([method]) => method === "x.profiles.get" || method === "contacts.get_social_tracking_by_handle")).toBe(true);
  });
});
