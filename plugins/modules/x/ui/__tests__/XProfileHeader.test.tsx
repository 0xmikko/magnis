// tst_fe_x_header_001 (social-post-rendering S2, INV-6) — the profile header
// shows a Tracked badge when the handle is tracked (via
// contacts.get_social_tracking_by_handle) and the three-dots menu offers
// Untrack, which round-trips contacts.set_social_tracking with the resolved
// contact id.
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
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
    if (method === "contacts.set_social_tracking") {
      return { tracked_x: false, x_handle: "jack" };
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

  it("three-dots → Untrack calls contacts.set_social_tracking for the contact", async () => {
    const rpc = rpcMock();
    const { findByText, findByLabelText } = renderHeader(rpc);
    await findByText("Tracked");

    fireEvent.click(await findByLabelText("Profile actions"));
    fireEvent.click(await findByText("Untrack on X"));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("contacts.set_social_tracking", {
        id: "c1",
        platform: "x",
        tracked: false,
      }),
    );
  });
});
