/** The declaration is not a wish: the config this module writes has to pass
 * it, through the module's REAL create path rather than a copied dictionary.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { describe, expect, it, vi } from "vitest";
import { entity as graphEntity, mockGraph, mountModule } from "@magnis/testkit/module";

import { TriggersModule } from "./module/service.ts";
import { trigger } from "./entities.ts";
import { TRIGGER } from "./schema.ts";

const TRIGGER_ID = "33333333-3333-4333-8333-333333333333";

async function writtenProperties(): Promise<Record<string, unknown>[]> {
  const written: Record<string, unknown>[] = [];
  const graph = mockGraph({
    create_entity: (input: { properties: Record<string, unknown> }) => {
      written.push(input.properties);
      return Promise.resolve(graphEntity(TRIGGER_ID, "watch replies", { schema_id: TRIGGER }));
    },
    update_properties: (input: { properties: Record<string, unknown> }) => {
      written.push(input.properties);
      return Promise.resolve(undefined);
    },
    add_link: () => Promise.resolve(undefined),
    delete_entity: () => Promise.resolve(undefined),
  } as never);
  const { module } = mountModule(TriggersModule, {
    graph,
    rpc: { execute: vi.fn(() => Promise.resolve(null)) },
    ctx: { extension_id: "triggers" },
  });
  await module.create({
    name: "watch replies",
    gate_prompt: "a reply arrived",
    action_prompt: "summarise it",
  });
  return written;
}

describe("triggers declares what it writes", () => {
  it("every record the module writes today passes its own declaration", async () => {
    const records = await writtenProperties();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(trigger.safeParse(record).error?.issues ?? []).toEqual([]);
    }
  });

  it("the stopped state the trigger page writes passes the declaration", () => {
    // TriggerDetailPanel's stop button writes status "stopped".
    const verdict = trigger.safeParse({
      name: "n", gate_prompt: "g", action_prompt: "a", status: "stopped",
      event_kinds: [], debounce_seconds: 0, firing_count: 0,
    });
    expect(verdict.error?.issues ?? []).toEqual([]);
  });

  it("a field the module does not declare is refused, and the error names it", () => {
    const verdict = trigger.safeParse({
      name: "n", gate_prompt: "g", action_prompt: "a", status: "active",
      event_kinds: [], debounce_seconds: 0, firing_count: 0,
      cooldown_seconds: 30,
    });
    expect(verdict.success).toBe(false);
    expect(JSON.stringify(verdict.error?.issues)).toContain("cooldown_seconds");
  });
});
