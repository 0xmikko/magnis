import { toolNamesEquivalent } from "@magnis/host/agent";
import type { AgentHistoryRendererRegistration } from "@magnis/host/runtime";
import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";
import { ProjectCard, projectHasMore } from "./EntityCards";
import { ProjectCreateRenderer } from "./ProjectCreateRenderer";
import { ProjectHeader } from "./ProjectHeader";

const moduleDefinition = defineModule({
  id: "projects",
  title: "Projects",
  icon: <Icon name="briefcase" size={26} />,
  iconName: "briefcase",
  themeColor: "blue",
  entityTypes: ["project"],
  primaryEntityType: "project",
  rpc: { update: "projects.update" },
  enableListRename: true,
  EntityCard: ProjectCard,
  hasMore: projectHasMore,
  HeaderComponent: ProjectHeader,
  toolCallRenderers: [{ entity: "projects.project", actions: ["create", "update"], Render: ProjectCreateRenderer as never }],
  extractAllowlistTarget: (call) => {
    const binding = call.toolBinding;
    if (binding?.entity !== "projects.project" || !["create", "update"].includes(binding.operation)) return null;
    const action = `${binding.entity}.${binding.operation}`;
    return { action, targetType: "tool_action", targetId: action, targetLabel: `${binding.operation === "create" ? "Create" : binding.operation === "merge" ? "Merge" : "Update"} project` };
  },  headerActionIcon: "plus",
  onHeaderAction: (runtime, onCreated) => {
    void (async (): Promise<void> => {
      const clientId = crypto.randomUUID();
      const result = await runtime.transport.rpc<{ id: string }>(
        "projects.create",
        { name: "New Project", client_id: clientId },
      );
      onCreated(result.id);
    })();
  },
  // Declarative "Link to Project" context-menu submenu for every entity.
  entityLink: {
    idPrefix: "project",
    label: "Link to Project",
    icon: "briefcase",
    listMethod: "projects.list",
    forEntityMethod: "projects.list_for_entity",
    idParam: "project_id",
    addMethod: "projects.add_member",
    removeMethod: "projects.remove_member",
    invalidateKey: "projects",
  },
});

const legacyRenderers: readonly AgentHistoryRendererRegistration[] = [
  { id: "projects-legacy-create", moduleId: "projects", match: (block) => typeof block.toolName === "string" && (toolNamesEquivalent(block.toolName, "projects.create") || toolNamesEquivalent(block.toolName, "project.create")), Render: ProjectCreateRenderer as never },
  { id: "projects-legacy-update", moduleId: "projects", match: (block) => typeof block.toolName === "string" && (toolNamesEquivalent(block.toolName, "projects.update") || toolNamesEquivalent(block.toolName, "project.update")), Render: ProjectCreateRenderer as never },
];

if (!moduleDefinition.agent?.historyRenderers) throw new Error("projects tool renderers missing");

export const ProjectsModule = {
  ...moduleDefinition,
  agent: { ...moduleDefinition.agent, historyRenderers: [...moduleDefinition.agent.historyRenderers, ...legacyRenderers] },
};
