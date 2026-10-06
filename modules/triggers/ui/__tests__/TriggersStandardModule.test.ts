/**
 * @layer: fe_agent
 * @test-id: tst_fe_agent_triggers_layout_001
 *
 * Triggers must use defineModule's standard list/detail infrastructure rather
 * than owning a second bespoke module shell.
 */
import { describe, expect, it } from "vitest";
import { mapTriggerListItem, TriggersModule } from "../index";

describe("tst_fe_agent_triggers_layout_001 — standard module shell", () => {
  it("exposes the store and setup supplied by defineModule", () => {
    expect(TriggersModule.createStore).toBeTypeOf("function");
    expect(TriggersModule.setup).toBeTypeOf("function");
  });

  it("maps the backend page into the standard one-line list item", () => {
    expect(mapTriggerListItem({
      id: "trigger-1",
      name: "Incoming reply monitor",
      schemaId: "triggers.trigger",
      watchedEntityNames: ["Channel Alpha", "Channel Beta"],
      actionPrompt: "Update the shared status note",
      lastFiredAt: "2026-07-27T12:00:00Z",
    })).toEqual({
      id: "trigger-1",
      name: "Incoming reply monitor",
      schemaId: "triggers.trigger",
      preview: "Watches Channel Alpha, Channel Beta",
      timestamp: "2026-07-27T12:00:00Z",
    });
  });
});
