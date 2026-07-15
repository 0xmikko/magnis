// linkedin-add-flow LA-3 (reworks social-contact-identity S5): the "+" opens
// a DIALOG — paste a URL/handle, validation feedback inline, success confirms
// "Syncing…" and keeps the dialog open for the next paste (batch-friendly).
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddProfileAction } from "../AddProfileAction";
import type { AppRuntime } from "@magnis/host/runtime";

function renderAction(rpc: ReturnType<typeof vi.fn>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const runtime = { transport: { rpc }, queryClient: qc } as unknown as AppRuntime;
  return render(
    <QueryClientProvider client={qc}>
      <AddProfileAction runtime={runtime} />
    </QueryClientProvider>,
  );
}

describe("LinkedIn AddProfileAction (dialog)", () => {
  it("opens a dialog; paste URL + Enter → rpc, cleared input, Syncing feedback, stays open", async () => {
    const rpc = vi.fn(async () => ({ contact_id: "c1", handle: "sgershuni", created: true }));
    const { getByLabelText, findByText, getByText } = renderAction(rpc);

    fireEvent.click(getByLabelText("Add profile"));
    expect(getByText("Add LinkedIn profile")).toBeTruthy();

    const input = getByLabelText("Profile URL or handle") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://linkedin.com/in/sgershuni" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("contacts.track_social_profile", {
        platform: "linkedin",
        url_or_handle: "https://linkedin.com/in/sgershuni",
      }),
    );
    await waitFor(() => expect(input.value).toBe(""));
    // Success feedback names the handle and the syncing state; the dialog
    // stays open for the next paste.
    expect(await findByText(/@sgershuni/)).toBeTruthy();
    expect(getByText("Add LinkedIn profile")).toBeTruthy();
  });

  it("garbage input → inline error, nothing else sent", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("invalid_url: not a linkedin profile");
    });
    const { getByLabelText, findByText } = renderAction(rpc);

    fireEvent.click(getByLabelText("Add profile"));
    const input = getByLabelText("Profile URL or handle") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://linkedin.com/company/acme" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await findByText(/Not a LinkedIn profile/)).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("Escape closes the dialog", async () => {
    const rpc = vi.fn();
    const { getByLabelText, queryByText } = renderAction(rpc);

    fireEvent.click(getByLabelText("Add profile"));
    const input = getByLabelText("Profile URL or handle") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => expect(queryByText("Add LinkedIn profile")).toBeNull());
  });
});
