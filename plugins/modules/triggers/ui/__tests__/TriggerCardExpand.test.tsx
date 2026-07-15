/**
 * tst_fe_agent_trigger_expand_001 — collapsed TriggerCard shows watches subtitle.
 * tst_fe_agent_trigger_expand_002 — TriggerCard renders gate/action/watches/count when expanded.
 * tst_fe_agent_trigger_expand_003 — Clicking the ExpandableEntityCard chevron flips the same TriggerCard.
 *
 * Validates the unified TriggerCard ("ONE COMPONENT PER ENTITY" rule
 * in docs/frontend/module-standard.md): the same component reads
 * ExpansionContext.expanded and switches between the compact subtitle
 * row and the full gate/action/watches block.
 *
 * Clients: @testing-library/react, @tanstack/react-query
 */
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import type { JSX } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TriggerCard } from "../TriggerCard";
import { ExpandableEntityCard, ExpansionContext } from "@magnis/host/agent";
import type { AppRuntime, EntityRendererRegistration } from "@magnis/host/runtime";

interface MockRuntimeOptions {
  readonly rpc: ReturnType<typeof vi.fn>;
  readonly registration?: EntityRendererRegistration | null;
}

function mockRuntime({ rpc, registration }: MockRuntimeOptions): AppRuntime {
  return {
    agent: {
      resolveEntityRenderer: () => registration ?? null,
    },
    transport: { rpc },
    modules: { get: () => undefined },
  } as unknown as AppRuntime;
}

function withQuery(node: JSX.Element): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const TRIGGER_DETAIL = {
  name: "Nudge Anna",
  gate_prompt: "No reply from Anna for 48h",
  action_prompt: "Send a gentle nudge",
  status: "active",
  watched_entities: [{ id: "c1", name: "Anna Komarova" }],
  firing_count: 3,
};

const ANNA_ENTITY = {
  id: "c1",
  schema_id: "contacts.contact",
  name: "Anna Komarova",
};

function rpcRouter(): ReturnType<typeof vi.fn> {
  return vi.fn((method: string) => {
    if (method === "triggers.get") return Promise.resolve(TRIGGER_DETAIL);
    if (method === "graph.entity.get") return Promise.resolve(ANNA_ENTITY);
    return Promise.resolve(null);
  });
}

describe("tst_fe_agent_trigger_expand_001 — collapsed subtitle from watches", () => {
  it("shows the watches subtitle once triggers.get resolves (compact layout)", async () => {
    const rpc = rpcRouter();
    const runtime = mockRuntime({ rpc });

    const { findByText } = render(
      withQuery(
        <TriggerCard schemaId="triggers.trigger" data={{ id: "t1", name: "Nudge Anna" }} runtime={runtime} />,
      ),
    );

    expect(await findByText(/Anna Komarova/)).toBeTruthy();
  });
});

describe("tst_fe_agent_trigger_expand_002 — expanded layout", () => {
  it("renders gate/action/watches/count when ExpansionContext.expanded=true", async () => {
    const rpc = rpcRouter();
    const runtime = mockRuntime({ rpc });

    const { findByText } = render(
      withQuery(
        <ExpansionContext.Provider value={{ bare: false, expanded: true }}>
          <TriggerCard
            schemaId="triggers.trigger"
            data={{ id: "t1", name: "Nudge Anna" }}
            runtime={runtime}
          />
        </ExpansionContext.Provider>,
      ),
    );

    expect(await findByText(/No reply from Anna for 48h/)).toBeTruthy();
    expect(await findByText(/Send a gentle nudge/)).toBeTruthy();
    expect(await findByText(/Fired 3x/)).toBeTruthy();
  });
});

describe("tst_fe_agent_trigger_expand_003 — chevron flips TriggerCard via context", () => {
  it("renders the gate prompt only after clicking the chevron", async () => {
    const rpc = rpcRouter();
    const registration: EntityRendererRegistration = {
      id: "trigger-entity",
      moduleId: "triggers",
      schemaMatch: "triggers.trigger",
      Render: TriggerCard,
      hasMore: (data) => typeof data.id === "string" && data.id.length > 0,
    };
    const runtime = mockRuntime({ rpc, registration });

    const { getByTestId, findByText, queryByText } = render(
      withQuery(
        <ExpandableEntityCard
          schemaId="triggers.trigger"
          data={{ id: "t1", name: "Nudge Anna" }}
          runtime={runtime}
        />,
      ),
    );

    expect(queryByText(/No reply from Anna for 48h/)).toBeNull();
    const chevron = getByTestId("expand-chevron");
    act(() => {
      fireEvent.click(chevron);
    });
    expect(await findByText(/No reply from Anna for 48h/)).toBeTruthy();
  });
});
