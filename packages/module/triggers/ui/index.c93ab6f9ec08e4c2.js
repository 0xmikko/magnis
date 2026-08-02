// plugins/modules/triggers/ui/index.tsx
import { Icon as Icon2 } from "/api/plugins/__host-shim.js?m=ui";
import { defineModule } from "/api/plugins/__host-shim.js?m=base";

// plugins/modules/triggers/ui/TriggerCard.tsx
import { useContext, useEffect, useState } from "/api/plugins/__host-shim.js?m=react";
import { EntityCardRenderer } from "/api/plugins/__host-shim.js?m=runtime";
import { BaseEntityCard, ActionPrefix } from "/api/plugins/__host-shim.js?m=base";
import { ExpansionContext } from "/api/plugins/__host-shim.js?m=agent";

// plugins/modules/triggers/ui/useTriggerDetail.ts
import { useQuery } from "/api/plugins/__host-shim.js?m=react-query";
function useTriggerDetail(entityId, runtime) {
  const query = useQuery({
    queryKey: ["triggers", entityId],
    queryFn: () => {
      if (entityId === undefined)
        throw new Error("triggers.get: missing entityId");
      return runtime.transport.rpc("triggers.get", { id: entityId });
    },
    enabled: typeof entityId === "string" && entityId.length > 0,
    staleTime: 30000
  });
  return query.data ?? null;
}

// plugins/modules/triggers/ui/TriggerCard.tsx
import { jsx, jsxs } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function useResolvedWatches(watched, runtime) {
  const [resolved, setResolved] = useState([]);
  useEffect(() => {
    if (!watched || watched.length === 0) {
      setResolved([]);
      return;
    }
    let cancelled = false;
    Promise.all(watched.map((w) => runtime.transport.rpc("graph.entity.get", { id: w.id }).then((e) => ({
      id: w.id,
      schema_id: e.schema_id ?? "",
      data: e
    })).catch(() => null))).then((r) => {
      if (!cancelled)
        setResolved(r.filter((x) => x !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [watched, runtime]);
  return resolved;
}
var STATUS_DOT = {
  active: "bg-green-500",
  paused: "bg-yellow-500",
  expired: "bg-content-muted",
  disabled: "bg-content-muted"
};
function TriggerCard(props) {
  const { data, runtime, action } = props;
  const entityId = data.id;
  const name = data.name;
  const status = data.status ?? "active";
  const detail = useTriggerDetail(entityId, runtime);
  const { expanded } = useContext(ExpansionContext);
  const watches = useResolvedWatches(expanded ? detail?.watched_entities : undefined, runtime);
  const watchedNames = detail?.watched_entities.map((e) => e.name ?? "?") ?? [];
  const subtitle = watchedNames.length > 0 ? `Watches ${watchedNames.join(", ")}` : undefined;
  return /* @__PURE__ */ jsxs(BaseEntityCard, {
    ...props,
    children: [
      /* @__PURE__ */ jsxs("div", {
        className: "min-w-0 flex-1",
        "data-testid": entityId ? `trigger-card-${entityId}` : undefined,
        children: [
          /* @__PURE__ */ jsxs("span", {
            className: "block truncate text-[12px] font-medium text-content",
            children: [
              /* @__PURE__ */ jsx(ActionPrefix, {
                action
              }),
              name ?? "Trigger"
            ]
          }),
          !expanded && subtitle && /* @__PURE__ */ jsx("span", {
            className: "block truncate text-[11px] text-content-tertiary",
            children: subtitle
          }),
          expanded && detail && /* @__PURE__ */ jsxs("div", {
            "data-testid": entityId ? `trigger-card-${entityId}-expanded` : undefined,
            className: "mt-2 flex flex-col gap-1 text-[11px] text-content-tertiary",
            children: [
              watches.length > 0 && /* @__PURE__ */ jsxs("div", {
                className: "flex gap-2",
                children: [
                  /* @__PURE__ */ jsx("span", {
                    className: "w-20 shrink-0 text-content-tertiary",
                    children: "Watches"
                  }),
                  /* @__PURE__ */ jsx("div", {
                    className: "flex min-w-0 flex-1 flex-col gap-1",
                    children: /* @__PURE__ */ jsx(ExpansionContext.Provider, {
                      value: { bare: false, expanded: false },
                      children: watches.map((e) => /* @__PURE__ */ jsx(EntityCardRenderer, {
                        schemaId: e.schema_id,
                        data: e.data,
                        runtime
                      }, e.id))
                    })
                  })
                ]
              }),
              detail.gate_prompt && /* @__PURE__ */ jsxs("div", {
                className: "flex gap-2",
                children: [
                  /* @__PURE__ */ jsx("span", {
                    className: "w-20 shrink-0 text-content-tertiary",
                    children: "Gate"
                  }),
                  /* @__PURE__ */ jsx("span", {
                    className: "min-w-0 flex-1 break-words text-content",
                    children: detail.gate_prompt
                  })
                ]
              }),
              detail.action_prompt && /* @__PURE__ */ jsxs("div", {
                className: "flex gap-2",
                children: [
                  /* @__PURE__ */ jsx("span", {
                    className: "w-20 shrink-0 text-content-tertiary",
                    children: "Action"
                  }),
                  /* @__PURE__ */ jsx("span", {
                    className: "min-w-0 flex-1 break-words text-content",
                    children: detail.action_prompt
                  })
                ]
              }),
              detail.firing_count > 0 && /* @__PURE__ */ jsxs("div", {
                className: "text-[10px] text-content-tertiary",
                children: [
                  "Fired ",
                  detail.firing_count,
                  "x"
                ]
              })
            ]
          })
        ]
      }),
      /* @__PURE__ */ jsx("span", {
        className: `mt-[5px] h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status] ?? "bg-content-muted"}`,
        "aria-label": `status: ${status}`
      })
    ]
  });
}

// plugins/modules/triggers/ui/TriggerDetailPanel.tsx
import { useMemo } from "/api/plugins/__host-shim.js?m=react";
import { useQuery as useQuery2 } from "/api/plugins/__host-shim.js?m=react-query";
import { ExpandableEntityCard } from "/api/plugins/__host-shim.js?m=agent";
import { InfoCard, Stack, Text } from "/api/plugins/__host-shim.js?m=ui";
import { jsx as jsx2, jsxs as jsxs2 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function deduplicateEntities(entities) {
  const ids = new Set;
  return entities.filter((entity) => {
    if (ids.has(entity.id))
      return false;
    ids.add(entity.id);
    return true;
  });
}
function TriggerDetailPanel({
  entityId,
  runtime
}) {
  const detail = useQuery2({
    queryKey: ["triggers", "detail", entityId],
    queryFn: () => runtime.transport.rpc("triggers.get", { id: entityId }),
    staleTime: 1e4
  });
  const watchIds = useMemo(() => detail.data?.watched_entities.map((entity) => entity.id) ?? [], [detail.data?.watched_entities]);
  const watchedEntities = useQuery2({
    queryKey: ["triggers", "watched-entities", entityId, watchIds],
    enabled: watchIds.length > 0,
    queryFn: async () => {
      const entities = await Promise.all(watchIds.map(async (id) => {
        const data = await runtime.transport.rpc("graph.entity.get", { id });
        return {
          id,
          schemaId: data.schema_id,
          name: data.name ?? "",
          data: { ...data, id }
        };
      }));
      return deduplicateEntities(entities);
    },
    staleTime: 30000
  });
  if (!detail.data) {
    return /* @__PURE__ */ jsx2(Stack, {
      gap: 3,
      align: "center",
      className: "py-12",
      children: /* @__PURE__ */ jsx2(Text, {
        variant: "body",
        color: "tertiary",
        children: detail.isLoading ? "Loading trigger…" : "Trigger unavailable"
      })
    });
  }
  const trigger = detail.data;
  const configurationRows = [
    { label: "Status", value: trigger.status },
    { label: "When", value: trigger.event_kinds.join(", ") },
    ...trigger.gate_prompt ? [{ label: "Gate", value: trigger.gate_prompt }] : [],
    { label: "Action", value: trigger.action_prompt },
    { label: "Fired", value: `${String(trigger.firing_count)}×` },
    { label: "Debounce", value: `${String(trigger.debounce_seconds)}s` },
    ...trigger.max_firings !== null && trigger.max_firings !== undefined ? [{ label: "Maximum firings", value: String(trigger.max_firings) }] : [],
    ...trigger.parent_episode_name ? [{ label: "Episode", value: trigger.parent_episode_name }] : []
  ];
  return /* @__PURE__ */ jsxs2(Stack, {
    gap: 4,
    className: "px-5 py-4",
    children: [
      watchIds.length > 0 ? /* @__PURE__ */ jsxs2(Stack, {
        gap: 2,
        children: [
          /* @__PURE__ */ jsx2(Text, {
            variant: "title",
            children: "Watches"
          }),
          watchedEntities.isError ? /* @__PURE__ */ jsx2(Text, {
            variant: "body",
            color: "tertiary",
            children: "Watched entities unavailable"
          }) : !watchedEntities.data ? /* @__PURE__ */ jsx2(Text, {
            variant: "body",
            color: "tertiary",
            children: "Loading entities…"
          }) : /* @__PURE__ */ jsx2(Stack, {
            gap: 2,
            children: watchedEntities.data.map((entity) => /* @__PURE__ */ jsx2(ExpandableEntityCard, {
              schemaId: entity.schemaId,
              data: entity.data,
              runtime
            }, entity.id))
          })
        ]
      }) : null,
      /* @__PURE__ */ jsx2(InfoCard, {
        rows: configurationRows
      })
    ]
  });
}

// plugins/modules/triggers/ui/TriggerToolCallRenderer.tsx
import { useEffect as useEffect2, useState as useState2 } from "/api/plugins/__host-shim.js?m=react";
import { Icon } from "/api/plugins/__host-shim.js?m=ui";
import { EntityCardRenderer as EntityCardRenderer2 } from "/api/plugins/__host-shim.js?m=runtime";
import { BaseToolCallCard } from "/api/plugins/__host-shim.js?m=base";
import { jsx as jsx3, jsxs as jsxs3 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function useResolvedEntities(watchIds, runtime) {
  const [entities, setEntities] = useState2([]);
  useEffect2(() => {
    if (!watchIds || watchIds.length === 0)
      return;
    let cancelled = false;
    Promise.all(watchIds.map((id) => runtime.transport.rpc("graph.entity.get", { id }).then((e) => ({
      id,
      schema_id: e.schema_id ?? "",
      name: e.name,
      data: e
    })).catch(() => null))).then((results) => {
      if (!cancelled)
        setEntities(results.filter((r) => r !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [watchIds, runtime]);
  return entities;
}
function TriggerToolCallRenderer({
  payload,
  runtime
}) {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args;
  const result = toolResult?.result;
  const isUpdate = tc.name === "triggers.update" || tc.name === "triggers_update";
  const [expanded, setExpanded] = useState2(false);
  const name = result?.name ?? args.name;
  const gatePrompt = result?.gate_prompt ?? args.gate_prompt;
  const actionPrompt = result?.action_prompt ?? args.action_prompt;
  const watchIds = args.watch_entity_ids;
  const watchedNames = result?.watched_entity_names;
  const watchedEntities = useResolvedEntities(watchIds, runtime);
  return /* @__PURE__ */ jsxs3(BaseToolCallCard, {
    icon: "zap",
    title: name ?? "Trigger",
    variant: "teal",
    status: tc.status,
    toolResult,
    superseded,
    isAllowlisted,
    primaryLabel: isUpdate ? "Update" : "Create",
    primaryIcon: "zap",
    doneLabel: isUpdate ? "Updated" : "Created",
    onApprove,
    onDeny,
    onAllowlistToggle,
    children: [
      /* @__PURE__ */ jsx3("div", {
        className: "absolute top-3 right-12",
        children: /* @__PURE__ */ jsx3("button", {
          type: "button",
          onClick: () => {
            setExpanded(!expanded);
          },
          className: "flex h-6 w-6 items-center justify-center rounded-md text-agent-text-muted hover:text-agent-text",
          children: /* @__PURE__ */ jsx3(Icon, {
            name: expanded ? "minimize-2" : "maximize-2",
            size: 13
          })
        })
      }),
      watchedEntities.length > 0 ? /* @__PURE__ */ jsxs3("div", {
        className: "mb-2 space-y-1",
        children: [
          /* @__PURE__ */ jsx3("span", {
            className: "text-[11px] text-agent-text-muted",
            children: "Watches"
          }),
          watchedEntities.map((entity) => /* @__PURE__ */ jsx3(EntityCardRenderer2, {
            schemaId: entity.schema_id,
            data: entity.data,
            runtime
          }, entity.id))
        ]
      }) : watchedNames && watchedNames.length > 0 ? /* @__PURE__ */ jsxs3("div", {
        className: "mb-2 text-[12px]",
        children: [
          /* @__PURE__ */ jsx3("span", {
            className: "text-agent-text-muted",
            children: "Watches: "
          }),
          /* @__PURE__ */ jsx3("span", {
            className: "text-agent-text",
            children: watchedNames.join(", ")
          })
        ]
      }) : null,
      gatePrompt && /* @__PURE__ */ jsxs3("div", {
        className: "mb-1.5 text-[12px]",
        children: [
          /* @__PURE__ */ jsx3("span", {
            className: "text-agent-text font-semibold",
            children: "Gate: "
          }),
          /* @__PURE__ */ jsx3("span", {
            className: "text-agent-text",
            children: expanded ? gatePrompt : gatePrompt.length > 80 ? gatePrompt.slice(0, 80) + "…" : gatePrompt
          })
        ]
      }),
      actionPrompt && /* @__PURE__ */ jsxs3("div", {
        className: "mb-1 text-[12px]",
        children: [
          /* @__PURE__ */ jsx3("span", {
            className: "text-agent-text font-semibold",
            children: "Action: "
          }),
          /* @__PURE__ */ jsx3("span", {
            className: "text-agent-text",
            children: expanded ? actionPrompt : actionPrompt.length > 100 ? actionPrompt.slice(0, 100) + "…" : actionPrompt
          })
        ]
      })
    ]
  });
}

// plugins/modules/triggers/ui/index.tsx
import { jsx as jsx4 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function mapTriggerListItem(raw) {
  const watchedEntityNames = Array.isArray(raw.watched_entity_names) ? raw.watched_entity_names.filter((name) => typeof name === "string") : [];
  const actionPrompt = typeof raw.action_prompt === "string" ? raw.action_prompt : "";
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : null,
    schema_id: "triggers.trigger",
    preview: watchedEntityNames.length > 0 ? `Watches ${watchedEntityNames.join(", ")}` : actionPrompt,
    timestamp: typeof raw.last_fired_at === "string" ? raw.last_fired_at : null
  };
}
var TriggersModule = defineModule({
  id: "triggers",
  title: "Triggers",
  icon: /* @__PURE__ */ jsx4(Icon2, {
    name: "zap",
    size: 26
  }),
  iconName: "zap",
  themeColor: "green",
  entityTypes: ["trigger"],
  primaryEntityType: "trigger",
  entityLabels: {
    trigger: {
      icon: "zap",
      label: "Trigger"
    }
  },
  rpc: {
    list: "triggers.list_page",
    update: "triggers.update"
  },
  mapListItem: mapTriggerListItem,
  DetailPanel: TriggerDetailPanel,
  EntityCard: TriggerCard,
  hasMore: (data) => typeof data.id === "string" && data.id.length > 0,
  toolCallRenderers: [
    {
      actions: ["create", "update"],
      Render: TriggerToolCallRenderer
    }
  ],
  extractAllowlistTarget: (toolCall) => {
    const isUpdate = toolCall.name === "triggers.update" || toolCall.name === "triggers_update";
    const isCreate = toolCall.name === "triggers.create" || toolCall.name === "triggers_create";
    if (!isCreate && !isUpdate)
      return null;
    const action = isUpdate ? "triggers.update" : "triggers.create";
    return {
      action,
      targetType: "tool_action",
      targetId: action,
      targetLabel: isUpdate ? "Update trigger" : "Create trigger"
    };
  }
});
export {
  mapTriggerListItem,
  TriggersModule
};
