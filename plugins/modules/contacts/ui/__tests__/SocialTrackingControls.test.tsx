// tst_fe_contacts_social_001 — the contact "Track on X / LinkedIn" toggle drives
// contacts.set_social_tracking (DEC-9). Toggling on sends tracked=true + handle;
// the initial checkbox state reflects contacts.get_social_tracking.

import { render, fireEvent, waitFor } from "@testing-library/react";
import type { AppRuntime } from "@magnis/host/runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SocialTrackingControls } from "../SocialTrackingControls";
import type { SocialTrackingState } from "../queries";

const useQueryMock = vi.fn();
let runtime: AppRuntime;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]): unknown => useQueryMock(...args),
}));

vi.mock("@magnis/host/runtime", () => ({
  useAppRuntime: (): AppRuntime => runtime,
}));

function setState(state: SocialTrackingState): void {
  useQueryMock.mockReturnValue({ data: state });
}

describe("SocialTrackingControls", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    runtime = {
      transport: { rpc: vi.fn().mockResolvedValue({}) },
      queryClient: { invalidateQueries: vi.fn() },
    } as unknown as AppRuntime;
  });

  it("reflects the current opt-in state from get_social_tracking", () => {
    setState({ tracked_x: true, x_handle: "jack" });
    const { getByLabelText } = render(<SocialTrackingControls entityId="c1" />);
    expect((getByLabelText("Track on X") as HTMLInputElement).checked).toBe(true);
    expect((getByLabelText("Track on LinkedIn") as HTMLInputElement).checked).toBe(false);
    expect((getByLabelText("x handle") as HTMLInputElement).value).toBe("jack");
  });

  it("toggling X on sends set_social_tracking {tracked:true, handle}", async () => {
    setState({});
    const { getByLabelText } = render(<SocialTrackingControls entityId="c1" />);
    fireEvent.change(getByLabelText("x handle"), { target: { value: "@Jack" } });
    fireEvent.click(getByLabelText("Track on X"));
    await waitFor(() =>
      expect(runtime.transport.rpc).toHaveBeenCalledWith("contacts.set_social_tracking", {
        id: "c1",
        platform: "x",
        tracked: true,
        handle: "@Jack",
      }),
    );
  });

  it("untoggling LinkedIn sends tracked:false", async () => {
    setState({ tracked_linkedin: true, linkedin_handle: "anndoe" });
    const { getByLabelText } = render(<SocialTrackingControls entityId="c1" />);
    fireEvent.click(getByLabelText("Track on LinkedIn"));
    await waitFor(() =>
      expect(runtime.transport.rpc).toHaveBeenCalledWith("contacts.set_social_tracking", {
        id: "c1",
        platform: "linkedin",
        tracked: false,
        handle: "anndoe",
      }),
    );
  });
});
