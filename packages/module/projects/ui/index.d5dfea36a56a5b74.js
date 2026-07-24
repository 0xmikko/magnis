// plugins/modules/projects/ui/index.tsx
import { Icon } from "/api/plugins/__host-shim.js?m=ui";
import { defineModule } from "/api/plugins/__host-shim.js?m=base";

// plugins/modules/projects/ui/EntityCards.tsx
import { useContext } from "/api/plugins/__host-shim.js?m=react";
import { BaseEntityCard } from "/api/plugins/__host-shim.js?m=base";
import { ActionPrefix } from "/api/plugins/__host-shim.js?m=base";
import { ExpansionContext } from "/api/plugins/__host-shim.js?m=agent";
import { jsx, jsxs } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function descriptionText(data) {
  if (typeof data.description === "string" && data.description.length > 0)
    return data.description;
  return;
}
function projectHasMore(data) {
  return descriptionText(data) !== undefined;
}
function ProjectCard(props) {
  const { data, action } = props;
  const name = data.name ?? "Untitled Project";
  const description = descriptionText(data);
  const preview = description ? description.slice(0, 80).replace(/\n/g, " ") : undefined;
  const { expanded } = useContext(ExpansionContext);
  return /* @__PURE__ */ jsx(BaseEntityCard, {
    ...props,
    children: /* @__PURE__ */ jsxs("div", {
      className: "min-w-0 flex-1",
      children: [
        /* @__PURE__ */ jsxs("span", {
          className: "block truncate text-[12px] font-medium text-content",
          children: [
            /* @__PURE__ */ jsx(ActionPrefix, {
              action
            }),
            name
          ]
        }),
        !expanded && preview && /* @__PURE__ */ jsx("span", {
          className: "block truncate text-[11px] text-content-tertiary",
          children: preview
        }),
        expanded && description && /* @__PURE__ */ jsx("div", {
          className: "mt-1 whitespace-pre-wrap break-words text-[11px] text-content",
          children: description
        })
      ]
    })
  });
}

// plugins/modules/projects/ui/ProjectCreateRenderer.tsx
import { BaseToolCallCard } from "/api/plugins/__host-shim.js?m=base";
import { jsx as jsx2, jsxs as jsxs2 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function ProjectCreateRenderer({
  payload
}) {
  const {
    toolCall: tc,
    toolResult,
    isAllowlisted,
    superseded,
    onApprove,
    onDeny,
    onAllowlistToggle
  } = payload;
  const args = tc.args;
  const name = typeof args.name === "string" && args.name.length > 0 ? args.name : "Untitled project";
  const status = typeof args.status === "string" && args.status.length > 0 ? args.status : "";
  const field = (label, value) => {
    if (!value)
      return null;
    return /* @__PURE__ */ jsxs2("div", {
      className: "mb-1 flex items-baseline gap-1 text-[11px]",
      children: [
        /* @__PURE__ */ jsxs2("span", {
          className: "shrink-0 w-16 text-[var(--color-agent-tool-sky-text)]",
          children: [
            label,
            ":"
          ]
        }),
        /* @__PURE__ */ jsx2("span", {
          className: "rounded border border-transparent px-1 py-0.5 text-agent-text",
          children: value
        })
      ]
    });
  };
  return /* @__PURE__ */ jsxs2(BaseToolCallCard, {
    icon: "briefcase",
    title: `Create project: ${name}`,
    variant: "sky",
    status: tc.status,
    toolResult,
    superseded,
    isAllowlisted,
    primaryLabel: "Create",
    primaryIcon: "check",
    doneLabel: "Created",
    onApprove,
    onDeny,
    onAllowlistToggle,
    children: [
      field("Name", name),
      field("Status", status)
    ]
  });
}

// plugins/modules/projects/ui/ProjectHeader.tsx
import {
  Avatar,
  TOPBAR_AVATAR_SIZE,
  TopBarHeader
} from "/api/plugins/__host-shim.js?m=ui";
import { jsx as jsx3 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function ProjectHeader({
  entityName,
  themeColor,
  onRename
}) {
  const initials = entityName ? entityName.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() : "?";
  return /* @__PURE__ */ jsx3(TopBarHeader, {
    leading: /* @__PURE__ */ jsx3(Avatar, {
      label: initials,
      color: themeColor,
      size: TOPBAR_AVATAR_SIZE
    }),
    title: entityName ?? "Untitled",
    onTitleEdit: onRename
  });
}

// plugins/modules/projects/ui/index.tsx
import { jsx as jsx4 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var ProjectsModule = defineModule({
  id: "projects",
  title: "Projects",
  icon: /* @__PURE__ */ jsx4(Icon, {
    name: "briefcase",
    size: 26
  }),
  iconName: "briefcase",
  themeColor: "blue",
  entityTypes: ["project"],
  primaryEntityType: "project",
  rpc: { update: "projects.update" },
  enableListRename: true,
  EntityCard: ProjectCard,
  hasMore: projectHasMore,
  HeaderComponent: ProjectHeader,
  toolCallRenderers: [
    {
      actions: ["create"],
      Render: ProjectCreateRenderer
    }
  ],
  extractAllowlistTarget: (tc) => {
    const n = tc.name;
    if (n !== "projects.create" && n !== "projects_create" && n !== "project.create" && n !== "project_create") {
      return null;
    }
    const args = tc.args;
    const name = typeof args.name === "string" && args.name.length > 0 ? args.name : "project";
    return {
      action: tc.name,
      targetType: "project",
      targetId: name,
      targetLabel: name
    };
  },
  headerActionIcon: "plus",
  onHeaderAction: (runtime, onCreated) => {
    (async () => {
      const clientId = crypto.randomUUID();
      const result = await runtime.transport.rpc("projects.create", { name: "New Project", client_id: clientId });
      onCreated(result.id);
    })();
  },
  entityLink: {
    idPrefix: "project",
    label: "Link to Project",
    icon: "briefcase",
    listMethod: "projects.list",
    forEntityMethod: "projects.list_for_entity",
    idParam: "project_id",
    addMethod: "projects.add_member",
    removeMethod: "projects.remove_member",
    invalidateKey: "projects"
  }
});
export {
  ProjectsModule
};
