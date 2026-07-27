/**
 * @layer: fe_agent
 * @test-id: tst_fe_agent_triggers_detail_001
 *
 * Watched graph entities use the canonical one-line entity renderer. Entity
 * identity is the ID, so distinct watches with the same display name remain.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { JSX } from "react";
import type { AppRuntime } from "@magnis/host/runtime";
import { TriggerDetailPanel } from "../TriggerDetailPanel";

const TRIGGER_DETAIL = {
  id: "trigger-1",
  name: "Vendor quote tracker",
  gate_prompt: "Only relevant replies",
  action_prompt: "Update the price table",
  status: "active",
  event_kinds: ["entity.created"],
  debounce_seconds: 0,
  firing_count: 0,
  watched_entities: [
    { id: "chat-1", name: "Vendor A <> Example Corp" },
    { id: "chat-duplicate", name: "Vendor A <> Example Corp" },
  ],
};

function withQuery(node: JSX.Element): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe("tst_fe_agent_triggers_detail_001 — canonical watched entity rows", () => {
  it("renders distinct same-name watches and the trigger configuration", async () => {
    const rpc = vi.fn((method: string, params: unknown) => {
      if (method === "triggers.get") return Promise.resolve(TRIGGER_DETAIL);
      if (method === "graph.entity.get") {
        const id = (params as { id: string }).id;
        return Promise.resolve({
          id,
          schema_id: "telegram.chat",
          name: "Vendor A <> Example Corp",
        });
      }
      return Promise.reject(new Error(`unexpected RPC: ${method}`));
    });
    const runtime = {
      transport: { rpc },
      agent: { resolveEntityRenderer: () => null },
      modules: { get: () => undefined },
    } as unknown as AppRuntime;

    const { findAllByText, findByText } = render(
      withQuery(
        <TriggerDetailPanel
          entityId="trigger-1"
          moduleId="triggers"
          runtime={runtime}
        />,
      ),
    );

    const rendered = await findAllByText("Vendor A <> Example Corp");
    expect(rendered).toHaveLength(2);
    expect(rendered.every((row) => row.closest("a") !== null)).toBe(true);
    expect(await findByText("Only relevant replies")).toBeTruthy();
    expect(await findByText("Update the price table")).toBeTruthy();
    expect(await findByText("entity.created")).toBeTruthy();
    expect(await findByText("active")).toBeTruthy();
  });
});
