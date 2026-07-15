// tst_fe_li_header_001 (social-post-rendering S2, INV-6) — LinkedIn mirror of
// tst_fe_x_header_001: Tracked badge + three-dots Untrack round-trips the
// contacts tracking RPCs with platform "linkedin".
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
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
    if (method === "contacts.set_social_tracking") {
      return { tracked_linkedin: false, linkedin_handle: "anndoe" };
    }
    throw new Error(`unexpected rpc ${method}`);
  });
}

describe("LinkedInProfileHeader tracking control", () => {
  it("Tracked badge + Untrack on LinkedIn round-trip", async () => {
    const rpc = rpcMock();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { findByText, findByLabelText } = render(
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
    fireEvent.click(await findByText("Untrack on LinkedIn"));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("contacts.set_social_tracking", {
        id: "c9",
        platform: "linkedin",
        tracked: false,
      }),
    );
  });
});
