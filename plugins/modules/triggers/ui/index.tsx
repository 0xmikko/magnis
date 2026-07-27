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

  return {
    id: raw.id as string,
    name: typeof raw.name === "string" ? raw.name : null,
    schema_id: "triggers.trigger",
    preview:
      watchedEntityNames.length > 0
        ? `Watches ${watchedEntityNames.join(", ")}`
        : actionPrompt,
    timestamp: typeof raw.last_fired_at === "string" ? raw.last_fired_at : null,
  };
}

export const TriggersModule = defineModule({
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
  toolCallRenderers: [
    {
      actions: ["create", "update"],
      Render: TriggerToolCallRenderer as never,
    },
  ],
  extractAllowlistTarget: (toolCall) => {
    const isUpdate =
      toolCall.name === "triggers.update" ||
      toolCall.name === "triggers_update";
    const isCreate =
      toolCall.name === "triggers.create" ||
      toolCall.name === "triggers_create";
    if (!isCreate && !isUpdate) return null;

    const action = isUpdate ? "triggers.update" : "triggers.create";
    return {
      action,
      targetType: "tool_action",
      targetId: action,
      targetLabel: isUpdate ? "Update trigger" : "Create trigger",
    };
  },
});
