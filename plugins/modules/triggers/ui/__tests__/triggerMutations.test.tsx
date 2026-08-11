/**
 * Pause, resume and delete belong to the module that owns the trigger. The
 * host's parallel panel had them; after this the plugin does, which is what
 * lets the host copy go.
 *
 * @layer: fe_trig
 * @test-id: tst_fe_trig_003
 * @scenario: scn_triggers_003
 * @covers plugins/modules/triggers/ui/TriggerDetailPanel.tsx::TriggerDetailPanel
 * @deterministic hand-built runtime double + explicit query cache; no network
 *
 * INV-P2.3 the panel can delete, pause and resume with the guards the host
 *          copy had. Deletion reports upward, invalidates the plugin's own
 *          keys, and drops exactly those owner details whose
 *          `linked_entities` name the deleted trigger — not every module
 *          detail, which would pass a weaker test.
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
    if (method === "triggers.delete") return Promise.resolve({ deleted: true });
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

describe("tst_fe_trig_003 — the panel pauses, resumes and deletes", () => {
  it("Step 1 → pauses, then resumes, reading the status back each time", async () => {
    const { runtime, rpc } = statefulRuntime();
    const { findByText } = render(
      withClient(
        freshClient(),
        <TriggerDetailPanel entityId="trigger-1" moduleId="triggers" runtime={runtime} />,
      ),
    );

    fireEvent.click(await findByText("Pause"));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("triggers.update", {
        id: "trigger-1",
        status: "paused",
      });
    });
    // The label follows the status the module reports back.
    expect(await findByText("Resume")).toBeTruthy();

    fireEvent.click(await findByText("Resume"));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("triggers.update", {
        id: "trigger-1",
        status: "active",
      });
    });
    expect(await findByText("Pause")).toBeTruthy();
  });

  it("Step 2 → deletes, and drops only the owners that named this trigger", async () => {
    const { runtime, rpc } = statefulRuntime();
    const client = freshClient();
    const onDeleted = vi.fn();

    // Two cached owner details. One lists the trigger among its linked
    // entities; the other does not and must survive.
    const OWNER_WITH = ["contacts", "detail", "c1"] as const;
    const OWNER_WITHOUT = ["companies", "detail", "co1"] as const;
    client.setQueryData(OWNER_WITH, {
      id: "c1",
      linked_entities: [{ id: "trigger-1", name: "Reply watch" }],
    });
    client.setQueryData(OWNER_WITHOUT, {
      id: "co1",
      linked_entities: [{ id: "some-other-entity", name: "Unrelated" }],
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");

    const { findByText } = render(
      withClient(
        client,
        <TriggerDetailPanel
          entityId="trigger-1"
          moduleId="triggers"
          runtime={runtime}
          onDeleted={onDeleted}
        />,
      ),
    );

    fireEvent.click(await findByText("Delete"));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("triggers.delete", { id: "trigger-1" });
    });
    // Reports upward — the host owns what selection means.
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledTimes(1);
    });
    // The plugin's own keys go.
    expect(
      invalidate.mock.calls.some(([arg]) => {
        const key = (arg as { queryKey?: readonly unknown[] } | undefined)?.queryKey;
        return Array.isArray(key) && key[0] === "triggers";
      }),
    ).toBe(true);
    // And exactly the owner that named it.
    expect(client.getQueryState(OWNER_WITH)?.isInvalidated).toBe(true);
    expect(client.getQueryState(OWNER_WITHOUT)?.isInvalidated).toBe(false);
  });

  it("Step 2b → does not drop an owner's descendant queries", async () => {
    const { runtime } = statefulRuntime();
    const client = freshClient();

    // Contacts nest `social_tracking` UNDER the detail key. A key-based
    // invalidation matches by prefix and would take this with it; only the
    // entry that actually names the trigger should go.
    const OWNER = ["contacts", "detail", "c1"] as const;
    const DESCENDANT = ["contacts", "detail", "c1", "social_tracking"] as const;
    client.setQueryData(OWNER, {
      id: "c1",
      linked_entities: [{ id: "trigger-1", name: "Reply watch" }],
    });
    client.setQueryData(DESCENDANT, { tracked_x: true });

    const { findByText } = render(
      withClient(
        client,
        <TriggerDetailPanel entityId="trigger-1" moduleId="triggers" runtime={runtime} />,
      ),
    );
    fireEvent.click(await findByText("Delete"));

    await waitFor(() => {
      expect(client.getQueryState(OWNER)?.isInvalidated).toBe(true);
    });
    expect(client.getQueryState(DESCENDANT)?.isInvalidated).toBe(false);
  });

  it("Step 3 → a rejected delete keeps the trigger and says why", async () => {
    const rpc = vi.fn((method: string) => {
      if (method === "triggers.get") return Promise.resolve(detailWith("active"));
      if (method === "triggers.fire_history") return Promise.resolve([]);
      if (method === "triggers.delete") return Promise.reject(new Error("permission denied"));
      return Promise.reject(new Error(`unexpected RPC: ${method}`));
    });
    const runtime = {
      transport: { rpc },
      agent: { resolveEntityRenderer: () => null },
      modules: { get: () => undefined },
    } as unknown as AppRuntime;
    const onDeleted = vi.fn();

    const { findByText } = render(
      withClient(
        freshClient(),
        <TriggerDetailPanel
          entityId="trigger-1"
          moduleId="triggers"
          runtime={runtime}
          onDeleted={onDeleted}
        />,
      ),
    );
    fireEvent.click(await findByText("Delete"));

    // Surfaced, not swallowed — and the host is NOT told the entity is gone.
    expect(await findByText(/Could not delete this trigger: permission denied/)).toBeTruthy();
    expect(onDeleted).not.toHaveBeenCalled();
    // The affordances are still there, because the trigger still is.
    expect(await findByText("Delete")).toBeTruthy();
    expect(await findByText("Pause")).toBeTruthy();
  });

  it("Step 3b → a rejected pause leaves the status alone and says why", async () => {
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
    fireEvent.click(await findByText("Pause"));

    expect(await findByText(/Could not change the status: backend down/)).toBeTruthy();
    // Still active, so still offering Pause.
    expect(await findByText("Pause")).toBeTruthy();
  });

  it("Step 3c → two clicks in one turn issue one write", async () => {
    // The write is held open, so the second click lands while the first is still
    // in flight and BEFORE React has re-rendered — which is why the guard is a
    // ref and not the mutation's `isPending` snapshot.
    let releaseDelete: (() => void) | undefined;
    const held = new Promise<{ deleted: boolean }>((resolve) => {
      releaseDelete = () => {
        resolve({ deleted: true });
      };
    });
    const rpc = vi.fn((method: string) => {
      if (method === "triggers.get") return Promise.resolve(detailWith("active"));
      if (method === "triggers.fire_history") return Promise.resolve([]);
      if (method === "triggers.delete") return held;
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
    const button = await findByText("Delete");
    // Both dispatched in the same turn, before any re-render could flip a
    // rendered `isPending` to true.
    fireEvent.click(button);
    fireEvent.click(button);

    const deletes = () => rpc.mock.calls.filter(([method]) => method === "triggers.delete");
    // `mutate` reaches the mutationFn on a microtask, so let those run: without
    // the ref guard BOTH clicks would have queued one and this settles at 2.
    await waitFor(() => {
      expect(deletes()).toHaveLength(1);
    });
    await Promise.resolve();
    expect(deletes()).toHaveLength(1);
    releaseDelete?.();
  });

  it("Step 3d → the host hears about the deletion before the cache work", async () => {
    const { runtime } = statefulRuntime();
    const client = freshClient();
    const order: string[] = [];
    vi.spyOn(client, "invalidateQueries").mockImplementation(() => {
      order.push("invalidate");
      return Promise.resolve();
    });
    const onDeleted = vi.fn(() => {
      order.push("onDeleted");
    });

    const { findByText } = render(
      withClient(
        client,
        <TriggerDetailPanel
          entityId="trigger-1"
          moduleId="triggers"
          runtime={runtime}
          onDeleted={onDeleted}
        />,
      ),
    );
    fireEvent.click(await findByText("Delete"));

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
    });
    // Awaiting the invalidations first would refetch this panel's own dead
    // queries — with retries, a second or more of a deleted trigger on screen.
    expect(order[0]).toBe("onDeleted");
  });

  it("Step 4 → one unreadable watch does not hide the others", async () => {
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

    // The readable watch renders, and the failed one is named rather than
    // taking every other watch down with it.
    expect(await findByText("Readable")).toBeTruthy();
    expect(await findByText(/w-bad \(unavailable\)/)).toBeTruthy();
  });
});
