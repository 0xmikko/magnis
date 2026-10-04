import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { setHostRuntime } from "../../../../packages/host-testdouble/runtime";
import { EmailDetailPanel } from "../EmailDetailPanel";

/** @test-id: tst_fe_email_sender_sync_001
 * @scenario: scn_email_sync_001
 * @covers: EmailDetailPanel
 * @deterministic: yes
 * @fixtures: stored email and its linked sender; pending, failed and denied changes
 */
describe("email sender synchronization", () => {
  it.each(["pending", "applyFailed", "saveFailed", "denied"])("targets the sender and reports %s without hiding stored mail", async (outcome) => {
    let syncEnabled = true;
    const rpc = vi.fn(async (method: string, params: Record<string, unknown>) => {
      if (method === "email.get") return {
        id: "email-1", schemaId: "email.message", sender: "Alice", subject: "Hello", body: "Saved mail body",
        channel: "email", timestamp: "2026-10-02T12:00:00Z", createdAt: "2026-10-02T12:00:00Z",
        canonical: {}, linkedEntities: [], metadata: { from_address: "alice@example.com", body_text: "Saved mail body" },
        senderSync: { id: "sender-uuid", syncEnabled, syncRevision: syncEnabled ? "0" : "1" },
      };
      if (method !== "email.address.setSyncEnabled") throw new Error(`Unexpected RPC ${method}`);
      if (outcome === "denied") throw new Error("Approval denied");
      if (outcome === "saveFailed") return { results: [{ identityId: "sender-uuid", targetId: "sender-uuid", kind: "failed", message: "Save refused" }] };
      syncEnabled = params.syncEnabled === true;
      return { results: [{ identityId: "sender-uuid", targetId: "sender-uuid", kind: "saved", syncEnabled, syncRevision: "1",
        application: outcome === "pending" ? { kind: "pending" } : { kind: "failed", message: "Worker unavailable" } }] };
    });
    setHostRuntime({ transport: { baseUrl: "", rpc } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = <QueryClientProvider client={client}><EmailDetailPanel entityId="email-1" /></QueryClientProvider>;
    const view = render(tree);
    fireEvent.click(await screen.findByRole("button", { name: "Stop sender synchronization" }));
    await waitFor(() => { expect(rpc).toHaveBeenCalledWith("email.address.setSyncEnabled", { id: "sender-uuid", syncEnabled: false }); });
    if (outcome === "pending" || outcome === "applyFailed") {
      expect((await screen.findByRole("status")).textContent).toContain(outcome === "pending" ? "saved. Applying" : "saved, but could not be applied: Worker unavailable");
      expect(await screen.findByRole("button", { name: "Start sender synchronization" })).not.toBeNull();
    } else {
      expect((await screen.findByRole("alert")).textContent).toContain(outcome === "denied" ? "Approval denied" : "Save refused");
      expect(screen.queryByRole("status")).toBeNull();
    }
    expect(screen.getByText("Saved mail body")).not.toBeNull();
    view.unmount();
    client.clear();
    const reload = render(tree);
    expect(await screen.findByRole("button", { name: syncEnabled ? "Stop sender synchronization" : "Start sender synchronization" })).not.toBeNull();
    expect(screen.getByText("Saved mail body")).not.toBeNull();
    reload.unmount();
    client.clear();
  });
});
