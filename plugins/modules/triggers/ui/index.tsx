// Triggers plugin — UI entry. Headless agent-only contribution (no sidebar):
// an entity card for `triggers.trigger` + a tool-call renderer for the write
// `triggers.create`. Exported as a plain `ModuleDefinition` (the host loader
// registers it identically to a builtin headless module).
import type { ModuleDefinition, ModuleAgentContribution } from "@magnis/host/runtime";
import { registerSchemaVisuals } from "@magnis/host/base";
import { TriggerCard } from "./TriggerCard";
import { TriggerToolCallRenderer } from "./TriggerToolCallRenderer";

// Reproduce the builtin module's load-time side effect: register the
// `triggers.trigger` schema visual (the headless ModuleDefinition path does not
// auto-register visuals the way `defineModule` does).
registerSchemaVisuals([{ schemaId: "triggers.trigger", entry: { icon: "zap", label: "Trigger" } }]);

/**
 * Match only the WRITE trigger tool. The dedicated TriggerToolCallRenderer is a
 * "Create / Created" approval-shaped card — applying it to read-only tools like
 * `triggers.list` / `triggers.get` produced a phantom "Trigger Created" row that
 * misled the operator. Read-only trigger tools fall through to the generic
 * `ToolCallCard` which renders "List triggers (N)".
 */
function isTriggerTool(name: string): boolean {
  return name === "triggers.create" || name === "triggers_create";
}

const triggersAgentContribution: ModuleAgentContribution = {
  entityRenderers: [
    {
      id: "trigger-entity",
      moduleId: "triggers",
      schemaMatch: "triggers.trigger",
      Render: TriggerCard,
      hasMore: (data) => typeof data.id === "string" && data.id.length > 0,
    },
  ],
  historyRenderers: [
    {
      id: "trigger-tool",
      moduleId: "triggers",
      match: (block) => block.toolName !== undefined && isTriggerTool(block.toolName),
      Render: TriggerToolCallRenderer as never,
      priority: 10,
    },
  ],
};

/** Headless module — no sidebar tab, just entity card + tool-call renderers. */
export const TriggersModule: ModuleDefinition = {
  id: "triggers",
  title: "Triggers",
  agent: triggersAgentContribution,
};
