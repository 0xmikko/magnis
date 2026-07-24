// plugins/modules/triggers/ui/index.tsx
import { registerSchemaVisuals } from "/api/plugins/__host-shim.js?m=base";

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

// plugins/modules/triggers/ui/TriggerToolCallRenderer.tsx
import { useEffect as useEffect2, useState as useState2 } from "/api/plugins/__host-shim.js?m=react";
import { Icon } from "/api/plugins/__host-shim.js?m=ui";
import { EntityCardRenderer as EntityCardRenderer2 } from "/api/plugins/__host-shim.js?m=runtime";
import { BaseToolCallCard } from "/api/plugins/__host-shim.js?m=base";
import { jsx as jsx2, jsxs as jsxs2 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
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
  const [expanded, setExpanded] = useState2(false);
  const name = result?.name ?? args.name;
  const gatePrompt = result?.gate_prompt ?? args.gate_prompt;
  const actionPrompt = result?.action_prompt ?? args.action_prompt;
  const watchIds = args.watch_entity_ids;
  const watchedNames = result?.watched_entity_names;
  const watchedEntities = useResolvedEntities(watchIds, runtime);
  return /* @__PURE__ */ jsxs2(BaseToolCallCard, {
    icon: "zap",
    title: name ?? "Trigger",
    variant: "teal",
    status: tc.status,
    toolResult,
    superseded,
    isAllowlisted,
    primaryLabel: "Create",
    primaryIcon: "zap",
    doneLabel: "Created",
    onApprove,
    onDeny,
    onAllowlistToggle,
    children: [
      /* @__PURE__ */ jsx2("div", {
        className: "absolute top-3 right-12",
        children: /* @__PURE__ */ jsx2("button", {
          type: "button",
          onClick: () => {
            setExpanded(!expanded);
          },
          className: "flex h-6 w-6 items-center justify-center rounded-md text-agent-text-muted hover:text-agent-text",
          children: /* @__PURE__ */ jsx2(Icon, {
            name: expanded ? "minimize-2" : "maximize-2",
            size: 13
          })
        })
      }),
      watchedEntities.length > 0 ? /* @__PURE__ */ jsxs2("div", {
        className: "mb-2 space-y-1",
        children: [
          /* @__PURE__ */ jsx2("span", {
            className: "text-[11px] text-agent-text-muted",
            children: "Watches"
          }),
          watchedEntities.map((entity) => /* @__PURE__ */ jsx2(EntityCardRenderer2, {
            schemaId: entity.schema_id,
            data: entity.data,
            runtime
          }, entity.id))
        ]
      }) : watchedNames && watchedNames.length > 0 ? /* @__PURE__ */ jsxs2("div", {
        className: "mb-2 text-[12px]",
        children: [
          /* @__PURE__ */ jsx2("span", {
            className: "text-agent-text-muted",
            children: "Watches: "
          }),
          /* @__PURE__ */ jsx2("span", {
            className: "text-agent-text",
            children: watchedNames.join(", ")
          })
        ]
      }) : null,
      gatePrompt && /* @__PURE__ */ jsxs2("div", {
        className: "mb-1.5 text-[12px]",
        children: [
          /* @__PURE__ */ jsx2("span", {
            className: "text-agent-text font-semibold",
            children: "Gate: "
          }),
          /* @__PURE__ */ jsx2("span", {
            className: "text-agent-text",
            children: expanded ? gatePrompt : gatePrompt.length > 80 ? gatePrompt.slice(0, 80) + "…" : gatePrompt
          })
        ]
      }),
      actionPrompt && /* @__PURE__ */ jsxs2("div", {
        className: "mb-1 text-[12px]",
        children: [
          /* @__PURE__ */ jsx2("span", {
            className: "text-agent-text font-semibold",
            children: "Action: "
          }),
          /* @__PURE__ */ jsx2("span", {
            className: "text-agent-text",
            children: expanded ? actionPrompt : actionPrompt.length > 100 ? actionPrompt.slice(0, 100) + "…" : actionPrompt
          })
        ]
      })
    ]
  });
}

// plugins/modules/triggers/ui/index.tsx
registerSchemaVisuals([{ schemaId: "triggers.trigger", entry: { icon: "zap", label: "Trigger" } }]);
function isTriggerTool(name) {
  return name === "triggers.create" || name === "triggers_create";
}
var triggersAgentContribution = {
  entityRenderers: [
    {
      id: "trigger-entity",
      moduleId: "triggers",
      schemaMatch: "triggers.trigger",
      Render: TriggerCard,
      hasMore: (data) => typeof data.id === "string" && data.id.length > 0
    }
  ],
  historyRenderers: [
    {
      id: "trigger-tool",
      moduleId: "triggers",
      match: (block) => block.toolName !== undefined && isTriggerTool(block.toolName),
      Render: TriggerToolCallRenderer,
      priority: 10
    }
  ]
};
var TriggersModule = {
  id: "triggers",
  title: "Triggers",
  agent: triggersAgentContribution
};
export {
  TriggersModule
};
