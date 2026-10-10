/** The declaration is not a wish: the config this module writes has to pass
 * it, through the module's REAL create path rather than a copied dictionary.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { CreateEntityParamsSchema } from "@magnis/sdk";
import { describe, expect, it, vi } from "vitest";
import { entity as graphEntity, mockGraph, mountModule } from "@magnis/testkit/module";

import { TriggersModule } from "./module/service.ts";
import { trigger } from "./entities.ts";
import { TRIGGER } from "./schema.ts";

const TRIGGER_ID = "33333333-3333-4333-8333-333333333333";

async function writtenProperties(): Promise<Record<string, unknown>[]> {
  const written: Record<string, unknown>[] = [];
  const graph = mockGraph({
    createEntity: (params) => {
      const input = CreateEntityParamsSchema.parse(params);
      if (input.properties === undefined) throw new Error("trigger must supply its initial properties");
      written.push(input.properties);
      return Promise.resolve(graphEntity(TRIGGER_ID, input.name, { schemaId: TRIGGER, properties: input.properties }));
    },
    addLink: () => Promise.resolve(undefined),
    deleteEntity: () => Promise.resolve(undefined),
  });
  const { module } = mountModule(TriggersModule, {
    graph,
    rpc: { execute: vi.fn(() => Promise.resolve(null)) },
    ctx: { extensionId: "triggers" },
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
