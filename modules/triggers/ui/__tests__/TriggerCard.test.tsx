/**
 * @layer: fe_agent
 * @test-id: tst_fe_agent_triggers_card_001
 *
 * INV-UI-1/2 (plan Stage 5): a scheduled trigger is never silent on the
 * canonical card — compact shows a schedule subtitle where a watched trigger
 * shows "Watches …", expanded adds a Schedule row; a watched-only trigger
 * renders exactly as before.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { JSX } from "react";
import type { AppRuntime } from "@magnis/host/runtime";
import { ExpansionContext } from "@magnis/host/agent";
import { TriggerCard } from "../TriggerCard";
import { mapTriggerListItem } from "../index";

const SCHEDULED_DETAIL = {
  id: "trigger-1",
  name: "Morning digest",
  gatePrompt: "always",
  actionPrompt: "summarize the inbox",
  status: "active",
  eventKinds: ["schedule_tick"],
  debounceSeconds: 0,
  firingCount: 3,
  watchedEntities: [],
  schedule: {
    cron: "0 9 * * MON-FRI",
    timezone: "Europe/Belgrade",
    activated_at: "2026-08-07T10:00:00Z",
  },
};

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

function withProviders(node: JSX.Element, expanded: boolean): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  return (
    <QueryClientProvider client={client}>
      <ExpansionContext.Provider value={{ bare: false, expanded }}>
        {node}
      </ExpansionContext.Provider>
    </QueryClientProvider>
  );
}

describe("tst_fe_agent_triggers_card_001 — schedule on the canonical card", () => {
  it("compact card shows the schedule subtitle", async () => {
    const { findByText } = render(
      withProviders(
        <TriggerCard
          schemaId="triggers.trigger"
          data={{
            id: "trigger-1",
            schemaId: "triggers.trigger",
            name: "Morning digest",
            status: "active",
          }}
          runtime={runtimeWith(SCHEDULED_DETAIL)}
        />,
        false,
      ),
    );
    expect(await findByText(/0 9 \* \* MON-FRI/)).toBeTruthy();
  });

  it("expanded card shows a Schedule row with cron and timezone", async () => {
    const { findByText } = render(
      withProviders(
        <TriggerCard
          schemaId="triggers.trigger"
          data={{
            id: "trigger-1",
            schemaId: "triggers.trigger",
            name: "Morning digest",
            status: "active",
          }}
          runtime={runtimeWith(SCHEDULED_DETAIL)}
        />,
        true,
      ),
    );
    expect(await findByText("Schedule")).toBeTruthy();
    expect(await findByText(/Europe\/Belgrade/)).toBeTruthy();
  });
});

describe("tst_fe_agent_triggers_card_002 — list preview precedence", () => {
  it("prefers the schedule over the action prompt", () => {
    const item = mapTriggerListItem({
      id: "trigger-1",
      name: "Morning digest",
      actionPrompt: "summarize the inbox",
      watchedEntityNames: [],
      schedule: {
        cron: "0 9 * * MON-FRI",
        timezone: "Europe/Belgrade",
        activated_at: "2026-08-07T10:00:00Z",
      },
    });
    expect(item.preview).toContain("0 9 * * MON-FRI");
  });

  it("keeps the watches preview for watched triggers", () => {
    const item = mapTriggerListItem({
      id: "trigger-2",
      name: "Reply watch",
      actionPrompt: "update the note",
      watchedEntityNames: ["info@hedgemasters.nl"],
    });
    expect(item.preview).toBe("Watches info@hedgemasters.nl");
  });
});
