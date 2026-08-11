/**
 * Fire history belongs to the surface that owns the trigger. The module has
 * exposed the indexed read all along (`@tool("fire_history")`); what was
 * missing was a panel that asked for it.
 *
 * @layer: fe_trig
 * @test-id: tst_fe_trig_002
 * @scenario: scn_triggers_002
 * @covers plugins/modules/triggers/ui/TriggerDetailPanel.tsx::TriggerDetailPanel
 * @deterministic hand-built runtime double; fixed timestamps, no network
 *
 * INV-P2.2 the plugin's detail panel shows fire history.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { JSX } from "react";
import type { AppRuntime } from "@magnis/host/runtime";
import { TriggerDetailPanel } from "../TriggerDetailPanel";

const DETAIL = {
  id: "trigger-1",
  name: "Reply watch",
  gate_prompt: "",
  action_prompt: "draft a reply",
  status: "active",
  event_kinds: ["sync_ingested"],
  debounce_seconds: 0,
  firing_count: 2,
  watched_entities: [],
};

const HISTORY = [
  { fired_at: "2026-08-11T10:00:00Z", event_entity_id: "e1", outcome: "spawned" },
  { fired_at: "2026-08-11T09:00:00Z", event_entity_id: "e2", outcome: "skipped_gate" },
];

function runtime(rpc: ReturnType<typeof vi.fn>): AppRuntime {
  return {
    transport: { rpc },
    agent: { resolveEntityRenderer: () => null },
    modules: { get: () => undefined },
  } as unknown as AppRuntime;
}

function withProviders(node: JSX.Element): JSX.Element {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe("tst_fe_trig_002 — the panel shows fire history", () => {
  it("asks the module for the history and renders its rows", async () => {
    const rpc = vi.fn((method: string) => {
      if (method === "triggers.get") return Promise.resolve(DETAIL);
      if (method === "triggers.fire_history") return Promise.resolve(HISTORY);
      return Promise.reject(new Error(`unexpected RPC: ${method}`));
    });

    const { findByText } = render(
      withProviders(
        <TriggerDetailPanel entityId="trigger-1" moduleId="triggers" runtime={runtime(rpc)} />,
      ),
    );

    // Scoped to the history section on purpose: the configuration card also
    // carries a "Fired" label for the firing count, and asserting on the
    // document as a whole would match that instead of a history row.
    const section = (await findByText("Recent activity")).parentElement;
    expect(section).not.toBeNull();
    // One row per execution, in the module's own vocabulary.
    expect(section?.textContent).toContain("Fired");
    expect(section?.textContent).toContain("Skipped (not relevant)");
    expect(rpc).toHaveBeenCalledWith("triggers.fire_history", { trigger_id: "trigger-1" });
  });
});
