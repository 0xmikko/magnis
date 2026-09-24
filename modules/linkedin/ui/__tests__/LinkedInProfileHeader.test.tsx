// Existing profile facts remain read-only after tracking controls retire.
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LinkedInProfileHeader } from "../ProfileHeader";
import type { AppRuntime } from "@magnis/host/runtime";

function rpcMock() {
  return vi.fn(async (method: string, _params?: unknown) => {
    if (method === "linkedin.profiles.get") {
      return {
        id: "e1",
        handle: "anndoe",
        display_name: "Ann Doe",
        follower_count: 4200,
        bio: "Builder",
        url: "https://linkedin.com/in/anndoe",
      };
    }
    if (method === "contacts.get_social_tracking_by_handle") {
      return { contact_id: "c9", tracked: true, handle: "anndoe" };
    }

    throw new Error(`unexpected rpc ${method}`);
  });
}

describe("LinkedInProfileHeader tracking control", () => {
  it("keeps the tracked badge and profile link without a write action", async () => {
    const rpc = rpcMock();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { findByText, findByLabelText, queryByText } = render(
      <QueryClientProvider client={qc}>
        <LinkedInProfileHeader
          entityId="e1"
          entityName="Ann Doe"
          moduleId="linkedin"
          themeColor="purple"
          runtime={{ transport: { rpc } } as unknown as AppRuntime}
        />
      </QueryClientProvider>,
    );
    expect(await findByText("Tracked")).toBeTruthy();

    fireEvent.click(await findByLabelText("Profile actions"));
    expect(await findByText("Open profile")).toBeTruthy();
    expect(queryByText("Untrack on LinkedIn")).toBeNull();
    expect(queryByText("Track on LinkedIn")).toBeNull();
    expect(rpc.mock.calls.every(([method]) => method === "linkedin.profiles.get" || method === "contacts.get_social_tracking_by_handle")).toBe(true);
  });
});
