import type { AgentHistoryBlock } from "@magnis/host/runtime";
import { toolNamesEquivalent } from "@magnis/host/agent";
import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";
import type { ListItem } from "@magnis/host/base";
import { TriggerCard } from "./TriggerCard";
import { TriggerDetailPanel } from "./TriggerDetailPanel";
import { TriggerToolCallRenderer } from "./TriggerToolCallRenderer";

export function mapTriggerListItem(raw: Record<string, unknown>): ListItem {
  const watchedEntityNames = Array.isArray(raw.watched_entity_names)
    ? raw.watched_entity_names.filter((name): name is string => typeof name === "string")
    : [];
  const actionPrompt = typeof raw.action_prompt === "string" ? raw.action_prompt : "";
  // INV-UI-1 (plan Stage 5): the schedule IS a scheduled trigger's "when" —
  // it outranks both the (empty) watches list and the action-prompt fallback.
  const schedule = raw.schedule as { cron?: unknown } | null | undefined;
  const cron = schedule && typeof schedule.cron === "string" ? schedule.cron : null;

  return {
    id: raw.id as string,
    name: typeof raw.name === "string" ? raw.name : null,
    schema_id: "triggers.trigger",
    preview: cron
      ? `Schedule ${cron}`
      : watchedEntityNames.length > 0
        ? `Watches ${watchedEntityNames.join(", ")}`
        : actionPrompt,
    timestamp: typeof raw.last_fired_at === "string" ? raw.last_fired_at : null,
  };
}

const triggersModule = defineModule({
  id: "triggers",
  title: "Triggers",
  icon: <Icon name="zap" size={26} />,
  iconName: "zap",
  themeColor: "green",
  entityTypes: ["trigger"],
  primaryEntityType: "trigger",
  entityLabels: {
    trigger: {
      icon: "zap",
      label: "Trigger",
    },
  },
  rpc: {
    list: "triggers.list_page",
    update: "triggers.update",
  },
  mapListItem: mapTriggerListItem,
  DetailPanel: TriggerDetailPanel,
  EntityCard: TriggerCard,
  hasMore: (data) => typeof data.id === "string" && data.id.length > 0,
  toolCallRenderers: [{ entity: "triggers.trigger", actions: ["create", "update", "delete", "link", "unlink", "fire_now"], Render: TriggerToolCallRenderer as never }],
  extractAllowlistTarget: (toolCall) => {
    const bound = toolCall.toolBinding;
    if (bound !== undefined && (bound.entity !== "triggers.trigger" || !["create", "update", "delete", "link", "unlink", "fire_now"].includes(bound.operation))) return null;
    const isUpdate = bound === undefined ? toolNamesEquivalent(toolCall.name, "triggers.update") : bound.operation === "update";
    const isCreate = bound === undefined ? toolNamesEquivalent(toolCall.name, "triggers.create") : bound.operation === "create";
    if (bound === undefined && !isCreate && !isUpdate) return null;
    const operation = bound?.operation ?? (isUpdate ? "update" : "create");
    const action = bound === undefined ? `triggers.${operation}` : `triggers.trigger.${operation}`;
    return { action, targetType: "tool_action", targetId: action,
      targetLabel: `${operation.charAt(0).toUpperCase()}${operation.slice(1).replaceAll("_", " ")} trigger` };
  },
});

export const TriggersModule = {
  ...triggersModule,
  agent: {
    ...triggersModule.agent,
    historyRenderers: [
      ...(triggersModule.agent?.historyRenderers ?? []),
      { id: "triggers-write-history", moduleId: "triggers", priority: 10,
        match: (block: AgentHistoryBlock): boolean => block.toolBinding === undefined && block.toolName !== undefined && ["triggers.create", "triggers.update"].some((name) => toolNamesEquivalent(block.toolName ?? "", name)),
        Render: TriggerToolCallRenderer as never },
    ],
  },
};
