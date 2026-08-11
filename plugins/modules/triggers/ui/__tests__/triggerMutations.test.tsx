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
});
