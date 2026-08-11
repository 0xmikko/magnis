/**
 * The card draws its own trigger, so the status it shows is the status the
 * module reported — never a guess made while the read is still in flight.
 *
 * @layer: fe_trig
 * @test-id: tst_fe_trig_001
 * @scenario: scn_triggers_001
 * @covers plugins/modules/triggers/ui/TriggerCard.tsx::TriggerCard
 * @deterministic hand-built runtime double; no clock, no network
 *
 * INV-P2.1 no status is displayed that was not read from the backend; while
 *          the detail is in flight the card shows no status at all.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { JSX } from "react";
import type { AppRuntime } from "@magnis/host/runtime";
import { ExpansionContext } from "@magnis/host/agent";
import { TriggerCard } from "../TriggerCard";

const PAUSED_DETAIL = {
  id: "trigger-1",
  name: "Reply watch",
  gate_prompt: "",
  action_prompt: "draft a reply",
  status: "paused",
  event_kinds: ["sync_ingested"],
  debounce_seconds: 0,
  firing_count: 2,
  watched_entities: [],
};

/** A runtime whose `triggers.get` never settles — the in-flight case. */
function pendingRuntime(): AppRuntime {
  return {
    transport: { rpc: vi.fn(() => new Promise<never>(() => undefined)) },
    agent: { resolveEntityRenderer: () => null },
    modules: { get: () => undefined },
  } as unknown as AppRuntime;
}

function runtimeWith(detail: Record<string, unknown>): AppRuntime {
  return {
    transport: {
      rpc: vi.fn((method: string) => {
        if (method === "triggers.get") return Promise.resolve(detail);
        return Promise.reject(new Error(`unexpected RPC: ${method}`));
      }),
    },
    agent: { resolveEntityRenderer: () => null },
    modules: { get: () => undefined },
  } as unknown as AppRuntime;
}

function withProviders(node: JSX.Element): JSX.Element {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ExpansionContext.Provider value={{ bare: false, expanded: false }}>
        {node}
      </ExpansionContext.Provider>
    </QueryClientProvider>
  );
}

describe("tst_fe_trig_001 — the card shows only a status it read", () => {
  // A link summary carries id and name and nothing else, so this is what the
  // generic linked-entity tab actually hands the card.
  const SUMMARY = { id: "trigger-1", schema_id: "triggers.trigger", name: "Reply watch" };

  it("Step 1 → renders no status marker while the detail is in flight", () => {
    const { queryByLabelText } = render(
      withProviders(
        <TriggerCard schemaId="triggers.trigger" data={SUMMARY} runtime={pendingRuntime()} />,
      ),
    );

    expect(queryByLabelText(/^status:/)).toBeNull();
  });

  it("Step 2 → shows exactly the status the module reported", async () => {
    const { findByLabelText, queryByLabelText } = render(
      withProviders(
        <TriggerCard
          schemaId="triggers.trigger"
          data={SUMMARY}
          runtime={runtimeWith(PAUSED_DETAIL)}
        />,
      ),
    );

    expect(await findByLabelText("status: paused")).toBeTruthy();
    expect(queryByLabelText("status: active")).toBeNull();
  });
});
