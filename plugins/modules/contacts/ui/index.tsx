import { toolNamesEquivalent } from "@magnis/host/agent";
import type { AgentHistoryRendererRegistration } from "@magnis/host/runtime";
import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";
import type { AppRuntime } from "@magnis/host/runtime";
import { ContactCard, contactHasMore } from "./EntityCards";
import { ContactBatchCreateRenderer } from "./ContactBatchCreateRenderer";
import { ContactCreateRenderer } from "./ContactCreateRenderer";
import { ContactMergeRenderer, ContactMergePreviewSilent } from "./ContactMergeRenderer";
import { ContactOverview } from "./ContactOverview";

export const MOCK_TAGS: readonly string[] = [
  "Friend",
  "Partner",
  "Crypto",
  "Berlin Tech",
];

export async function createContactFromHeader(
  runtime: AppRuntime,
  onCreated: (id: string) => void,
): Promise<void> {
  // @tested-by: tst_fe_contacts_browser_001
  const result = await runtime.transport.rpc<{ id: string }>("contacts.create", {
    name: "New Contact",
    client_id: crypto.randomUUID(),
  });
  onCreated(result.id);
}

const moduleDefinition = defineModule({
  id: "contacts",
  title: "Contacts",
  icon: <Icon name="user" size={26} />,
  iconName: "user",
  themeColor: "purple",
  entityTypes: ["person"],
  primaryEntityType: "person",
  entityLabels: { person: { icon: "user", label: "Contact" } },
  rpc: { update: "contacts.update" },
  enableListRename: true,
  headerActionIcon: "plus",
  onHeaderAction: (runtime, onCreated) => {
    void createContactFromHeader(runtime, onCreated);
  },
  EntityCard: ContactCard,
  hasMore: contactHasMore,
  DetailsTabContent: ContactOverview,
  toolCallRenderers: [
    { entity: "contacts.person", actions: ["create"], Render: ContactCreateRenderer as never },
    { entity: "contacts.person", actions: ["merge"], Render: ContactMergeRenderer as never },
  ],
  extractAllowlistTarget: (call) => {
    const binding = call.toolBinding;
    if (binding?.entity !== "contacts.person" || !["create", "merge"].includes(binding.operation)) return null;
    if (binding.operation === "merge" && typeof call.args === "object" && call.args !== null && "preview" in call.args && call.args.preview === true) return null;
    const action = `${binding.entity}.${binding.operation}`;
    return { action, targetType: "tool_action", targetId: action, targetLabel: `${binding.operation === "create" ? "Create" : binding.operation === "merge" ? "Merge" : "Update"} contact` };
  },  groupBy: "letter",
  getGroupLetter: (item) => item.name?.[0]?.toUpperCase() ?? "#",
  mapListItem: (raw) => ({
    id: raw.id as string,
    name: (raw.name as string | undefined) ?? null,
    schema_id: (raw.schema_id as string | undefined) ?? "",
    preview: (raw.email as string | undefined) ?? (raw.phone as string | undefined) ?? null,
    timestamp: null,
    avatar_url: (raw.avatar_url as string | undefined) ?? null,
    is_pinned: (raw.is_pinned as boolean | undefined) ?? undefined,
    is_archived: (raw.is_archived as boolean | undefined) ?? undefined,
  }),
});

const legacyRenderers: readonly AgentHistoryRendererRegistration[] = [
  { id: "contacts-legacy-create", moduleId: "contacts", match: (block) => typeof block.toolName === "string" && (toolNamesEquivalent(block.toolName, "contacts.create") || toolNamesEquivalent(block.toolName, "contact.create")), Render: ContactCreateRenderer as never },
  { id: "contacts-legacy-batch_create", moduleId: "contacts", match: (block) => typeof block.toolName === "string" && (toolNamesEquivalent(block.toolName, "contacts.batch_create") || toolNamesEquivalent(block.toolName, "contact.batch_create")), Render: ContactBatchCreateRenderer as never },
  { id: "contacts-legacy-merge", moduleId: "contacts", match: (block) => typeof block.toolName === "string" && (toolNamesEquivalent(block.toolName, "contacts.merge") || toolNamesEquivalent(block.toolName, "contact.merge")), Render: ContactMergeRenderer as never },
  { id: "contacts-legacy-merge_preview", moduleId: "contacts", match: (block) => typeof block.toolName === "string" && (toolNamesEquivalent(block.toolName, "contacts.merge_preview") || toolNamesEquivalent(block.toolName, "contact.merge_preview")), Render: ContactMergePreviewSilent as never },
];

if (!moduleDefinition.agent?.historyRenderers) throw new Error("contacts tool renderers missing");

export const ContactsModule = {
  ...moduleDefinition,
  agent: { ...moduleDefinition.agent, historyRenderers: [...moduleDefinition.agent.historyRenderers, ...legacyRenderers] },
};
