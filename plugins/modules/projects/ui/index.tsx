import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";
import { ProjectCard, projectHasMore } from "./EntityCards";
import { ProjectCreateRenderer } from "./ProjectCreateRenderer";
import { ProjectHeader } from "./ProjectHeader";

export const ProjectsModule = defineModule({
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
  toolCallRenderers: [
    {
      actions: ["create"],
      Render: ProjectCreateRenderer as never,
    },
  ],
  extractAllowlistTarget: (tc) => {
    const n = tc.name;
    if (n !== "projects.create" && n !== "projects_create" && n !== "project.create" && n !== "project_create") {
      return null;
    }
    const args = tc.args as Record<string, unknown>;
    const name = typeof args.name === "string" && args.name.length > 0
      ? args.name
      : "project";
    return {
      action: tc.name,
      targetType: "project",
      targetId: name,
      targetLabel: name,
    };
  },
  headerActionIcon: "plus",
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
