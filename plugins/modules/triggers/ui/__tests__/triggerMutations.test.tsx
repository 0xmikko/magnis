/**
 * A trigger is part of the graph, so it is never deleted — it is stopped. The
 * panel therefore carries exactly ONE write affordance, a toggle between
 * `active` and `stopped`, and no destructive one at all.
 *
 * @layer: fe_trig
 * @test-id: tst_fe_trig_003
 * @scenario: scn_triggers_003
 * @covers plugins/modules/triggers/ui/TriggerDetailPanel.tsx::TriggerDetailPanel
 * @deterministic hand-built runtime double + explicit query cache; no network
 *
 * INV-P2.3 the panel can stop and restart a trigger, and CANNOT delete one.
 *          A rejected write is surfaced, not swallowed, and one trigger's
 *          in-flight write never blocks another's.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { JSX } from "react";
import type { AppRuntime } from "@magnis/host/runtime";
import { TriggerDetailPanel } from "../TriggerDetailPanel";

function detailWith(status: string): Record<string, unknown> {
  return {
    id: "trigger-1",
    name: "Reply watch",
    gate_prompt: "",
    action_prompt: "draft a reply",
    status,
    event_kinds: ["sync_ingested"],
    debounce_seconds: 0,
    firing_count: 2,
    watched_entities: [],
  };
}

/**
 * A runtime whose `triggers.update` actually moves the status, so "the
 * refreshed status" is a real read-back rather than local optimism.
 */
function statefulRuntime(): { readonly runtime: AppRuntime; readonly rpc: ReturnType<typeof vi.fn> } {
  let status = "active";
  const rpc = vi.fn((method: string, params?: Record<string, unknown>) => {
    if (method === "triggers.get") return Promise.resolve(detailWith(status));
    if (method === "triggers.fire_history") return Promise.resolve([]);
    if (method === "triggers.update") {
      status = String(params?.status);
      return Promise.resolve({ updated: true });
    }
    return Promise.reject(new Error(`unexpected RPC: ${method}`));
  });
  return {
    rpc,
    runtime: {
      transport: { rpc },
      agent: { resolveEntityRenderer: () => null },
      modules: { get: () => undefined },
    } as unknown as AppRuntime,
  };
}

function withClient(client: QueryClient, node: JSX.Element): JSX.Element {
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function freshClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
}

describe("tst_fe_trig_003 — the panel stops and restarts, and cannot delete", () => {
  it("Step 1 → stops, then starts, reading the status back each time", async () => {
    const { runtime, rpc } = statefulRuntime();
    const { findByText } = render(
      withClient(
        freshClient(),
        <TriggerDetailPanel entityId="trigger-1" moduleId="triggers" runtime={runtime} />,
      ),
    );

    fireEvent.click(await findByText("Stop"));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("triggers.update", {
        id: "trigger-1",
        status: "stopped",
      });
    });
    // The label follows the status the module reports back.
    expect(await findByText("Start")).toBeTruthy();

    fireEvent.click(await findByText("Start"));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("triggers.update", {
        id: "trigger-1",
        status: "active",
      });
    });
    expect(await findByText("Stop")).toBeTruthy();
  });

  it("Step 2 → offers no way to delete a trigger", async () => {
    // A trigger is part of the graph. The affordance is absent, not disabled:
    // there is no Delete control and the panel never calls `triggers.delete`.
    const { runtime, rpc } = statefulRuntime();
    const { findByText, queryByText } = render(
      withClient(
        freshClient(),
        <TriggerDetailPanel entityId="trigger-1" moduleId="triggers" runtime={runtime} />,
      ),
    );

    await findByText("Stop");
    expect(queryByText("Delete")).toBeNull();
    expect(queryByText(/Remove/i)).toBeNull();
    expect(rpc.mock.calls.map(([m]) => m)).not.toContain("triggers.delete");
  });

  it("Step 3 → a rejected stop leaves the status alone and says why", async () => {
    const rpc = vi.fn((method: string) => {
      if (method === "triggers.get") return Promise.resolve(detailWith("active"));
      if (method === "triggers.fire_history") return Promise.resolve([]);
      if (method === "triggers.update") return Promise.reject(new Error("backend down"));
      return Promise.reject(new Error(`unexpected RPC: ${method}`));
    });
    const runtime = {
      transport: { rpc },
      agent: { resolveEntityRenderer: () => null },
      modules: { get: () => undefined },
    } as unknown as AppRuntime;

    const { findByText } = render(
      withClient(
        freshClient(),
        <TriggerDetailPanel entityId="trigger-1" moduleId="triggers" runtime={runtime} />,
      ),
    );
    fireEvent.click(await findByText("Stop"));

    expect(await findByText(/Could not change the status: backend down/)).toBeTruthy();
    // Still active, so still offering Stop.
    expect(await findByText("Stop")).toBeTruthy();
  });

  it("Step 4 → two clicks in one turn issue one write", async () => {
    // The write is held open, so the second click lands while the first is
    // still in flight and BEFORE React has re-rendered — which is why the guard
    // is a ref and not the mutation's `isPending` snapshot.
    let release: (() => void) | undefined;
    const held = new Promise<{ updated: boolean }>((resolve) => {
      release = () => {
        resolve({ updated: true });
      };
    });
    const rpc = vi.fn((method: string) => {
      if (method === "triggers.get") return Promise.resolve(detailWith("active"));
      if (method === "triggers.fire_history") return Promise.resolve([]);
      if (method === "triggers.update") return held;
      return Promise.reject(new Error(`unexpected RPC: ${method}`));
    });
    const runtime = {
      transport: { rpc },
      agent: { resolveEntityRenderer: () => null },
      modules: { get: () => undefined },
    } as unknown as AppRuntime;

    const { findByText } = render(
      withClient(
        freshClient(),
        <TriggerDetailPanel entityId="trigger-1" moduleId="triggers" runtime={runtime} />,
      ),
    );
    const button = await findByText("Stop");
    fireEvent.click(button);
    fireEvent.click(button);

    const updates = (): unknown[] =>
      rpc.mock.calls.filter(([method]) => method === "triggers.update");
    await waitFor(() => {
      expect(updates()).toHaveLength(1);
    });
    await Promise.resolve();
    expect(updates()).toHaveLength(1);
    release?.();
  });

  it("Step 5 → a write in flight does not lock the next trigger", async () => {
    // The host renders this panel unkeyed, so switching selection reuses the
    // component instance and its refs. A boolean guard would survive the switch
    // and swallow a legitimate Stop on the second trigger; the guard holds ids.
    let release: (() => void) | undefined;
    const held = new Promise<{ updated: boolean }>((resolve) => {
      release = () => {
        resolve({ updated: true });
      };
    });
    const rpc = vi.fn((method: string, params?: Record<string, unknown>) => {
      if (method === "triggers.get") return Promise.resolve(detailWith("active"));
      if (method === "triggers.fire_history") return Promise.resolve([]);
      if (method === "triggers.update") {
        return params?.id === "trigger-1" ? held : Promise.resolve({ updated: true });
      }
      return Promise.reject(new Error(`unexpected RPC: ${method}`));
    });
    const runtime = {
      transport: { rpc },
      agent: { resolveEntityRenderer: () => null },
      modules: { get: () => undefined },
    } as unknown as AppRuntime;
    const client = freshClient();
    const panel = (id: string): JSX.Element =>
      withClient(
        client,
        <TriggerDetailPanel entityId={id} moduleId="triggers" runtime={runtime} />,
      );
    const stopped = (): string[] =>
      rpc.mock.calls
        .filter(([m]) => m === "triggers.update")
        .map(([, params]) => String((params as { id: string }).id));

    const { findByText, rerender } = render(panel("trigger-1"));
    fireEvent.click(await findByText("Stop"));
    await waitFor(() => {
      expect(stopped()).toEqual(["trigger-1"]);
    });

    rerender(panel("trigger-2"));
    fireEvent.click(await findByText("Stop"));
    await waitFor(() => {
      expect(stopped()).toEqual(["trigger-1", "trigger-2"]);
    });
    release?.();
  });

  it("Step 6 → walking A → B → A does not write A twice", async () => {
    // A single remembered id would be overwritten by B, and coming back to A
    // would find nothing in flight. Both writes stay open for the whole walk.
    const holds = new Map<string, () => void>();
    const rpc = vi.fn((method: string, params?: Record<string, unknown>) => {
      if (method === "triggers.get") return Promise.resolve(detailWith("active"));
      if (method === "triggers.fire_history") return Promise.resolve([]);
      if (method === "triggers.update") {
        const id = String(params?.id);
        return new Promise<{ updated: boolean }>((resolve) => {
          holds.set(id, () => {
            resolve({ updated: true });
          });
        });
      }
      return Promise.reject(new Error(`unexpected RPC: ${method}`));
    });
    const runtime = {
      transport: { rpc },
      agent: { resolveEntityRenderer: () => null },
      modules: { get: () => undefined },
    } as unknown as AppRuntime;
    const client = freshClient();
    const panel = (id: string): JSX.Element =>
      withClient(
        client,
        <TriggerDetailPanel entityId={id} moduleId="triggers" runtime={runtime} />,
      );
    const stopped = (): string[] =>
      rpc.mock.calls
        .filter(([m]) => m === "triggers.update")
        .map(([, params]) => String((params as { id: string }).id));

    const { findByText, rerender } = render(panel("trigger-1"));
    fireEvent.click(await findByText("Stop"));
    await waitFor(() => {
      expect(stopped()).toEqual(["trigger-1"]);
    });

    rerender(panel("trigger-2"));
    fireEvent.click(await findByText("Stop"));
    await waitFor(() => {
      expect(stopped()).toEqual(["trigger-1", "trigger-2"]);
    });

    // Back to A, whose write never settled.
    rerender(panel("trigger-1"));
    fireEvent.click(await findByText("Stop"));
    await Promise.resolve();
    expect(stopped()).toEqual(["trigger-1", "trigger-2"]);

    for (const release of holds.values()) release();
  });

  it("Step 7 → a rejected write frees that trigger's guard, even after a switch", async () => {
    // `onSettled` releases the id the write CARRIED, not whatever is shown when
    // it lands. Releasing the shown id would leave the rejected trigger in the
    // set forever and Stop would be dead for the life of the panel.
    let reject: ((reason: Error) => void) | undefined;
    const held = new Promise<never>((_resolve, rej) => {
      reject = rej;
    });
    const rpc = vi.fn((method: string, params?: Record<string, unknown>) => {
      if (method === "triggers.get") return Promise.resolve(detailWith("active"));
      if (method === "triggers.fire_history") return Promise.resolve([]);
      if (method === "triggers.update") {
        return params?.id === "trigger-1" && reject !== undefined
          ? held
          : Promise.resolve({ updated: true });
      }
      return Promise.reject(new Error(`unexpected RPC: ${method}`));
    });
    const runtime = {
      transport: { rpc },
      agent: { resolveEntityRenderer: () => null },
      modules: { get: () => undefined },
    } as unknown as AppRuntime;
    const client = freshClient();
    const panel = (id: string): JSX.Element =>
      withClient(
        client,
        <TriggerDetailPanel entityId={id} moduleId="triggers" runtime={runtime} />,
      );
    const writesOf = (id: string): number =>
      rpc.mock.calls.filter(
        ([m, params]) => m === "triggers.update" && (params as { id: string }).id === id,
      ).length;

    const { findByText, rerender } = render(panel("trigger-1"));
    fireEvent.click(await findByText("Stop"));
    await waitFor(() => {
      expect(writesOf("trigger-1")).toBe(1);
    });

    rerender(panel("trigger-2"));
    const rejectNow = reject;
    reject = undefined;
    rejectNow?.(new Error("permission denied"));
    // Wait for the error to surface: React Query moves the mutation into its
    // error state after `onSettled`, so this cannot pass before the guard is
    // released.
    await findByText(/Could not change the status/);

    rerender(panel("trigger-1"));
    fireEvent.click(await findByText("Stop"));
    await waitFor(() => {
      expect(writesOf("trigger-1")).toBe(2);
    });
  });

  it("Step 8 → one unreadable watch does not hide the others", async () => {
    const rpc = vi.fn((method: string, params?: Record<string, unknown>) => {
      if (method === "triggers.get") {
        return Promise.resolve({
          ...detailWith("active"),
          watched_entities: [
            { id: "w-ok", name: "Readable" },
            { id: "w-bad", name: "Unreadable" },
          ],
        });
      }
      if (method === "triggers.fire_history") return Promise.resolve([]);
      if (method === "graph.entity.get") {
        if (params?.id === "w-ok") {
          return Promise.resolve({ id: "w-ok", schema_id: "contacts.person", name: "Readable" });
        }
        return Promise.reject(new Error("entity unavailable"));
      }
      return Promise.reject(new Error(`unexpected RPC: ${method}`));
    });
    const runtime = {
      transport: { rpc },
      agent: { resolveEntityRenderer: () => null },
      modules: { get: () => undefined },
    } as unknown as AppRuntime;

    const { findByText } = render(
      withClient(
        freshClient(),
        <TriggerDetailPanel entityId="trigger-1" moduleId="triggers" runtime={runtime} />,
      ),
    );

    expect(await findByText("Readable")).toBeTruthy();
    expect(await findByText(/w-bad \(unavailable\)/)).toBeTruthy();
  });
});
