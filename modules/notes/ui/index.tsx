import { toolNamesEquivalent } from "@magnis/host/agent";
import type { AgentHistoryRendererRegistration } from "@magnis/host/runtime";
import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";
import type { AppRuntime } from "@magnis/host/runtime";
import { NoteCard, noteHasMore } from "./EntityCards";
import { NoteDetailPanel } from "./NoteDetailPanel";
import { NoteToolCallRenderer } from "./NoteToolCallRenderer";

export async function createNoteFromHeader(
  runtime: AppRuntime,
  onCreated: (id: string) => void,
): Promise<void> {
  const clientId = crypto.randomUUID();
  // @tested-by: tst_fe_notes_browser_001
  // @invariant: browser-created notes satisfy the package's nonblank body contract.
  const result = await runtime.transport.rpc<{ id: string }>("notes.create", {
    title: "New Note",
    body: "Start writing...",
    client_id: clientId,
  });
  const list = await runtime.transport.rpc<{ readonly items: readonly { readonly id: string }[] }>(
    "notes.list",
    { limit: 100, offset: 0 },
  );
  if (!list.items.some((item) => item.id === result.id)) {
    throw new Error(`created note ${result.id} is not visible in notes.list`);
  }
  onCreated(result.id);
}

const moduleDefinition = defineModule({
  id: "notes",
  title: "Notes",
  icon: <Icon name="notebook-pen" size={26} />,
  iconName: "notebook-pen",
  themeColor: "green",
  entityTypes: ["note"],
  primaryEntityType: "note",
  rpc: { update: "notes.update" },
  enableListRename: true,
  mapRenameParams: (id, name) => ({ id, title: name }),
  EntityCard: NoteCard,
  hasMore: noteHasMore,
  DetailPanel: NoteDetailPanel,
  detailType: "custom",
  headerActionIcon: "plus",
  onHeaderAction: (runtime, onCreated) => {
    void createNoteFromHeader(runtime, onCreated);
  },
  toolCallRenderers: [{ entity: "notes.note", actions: ["create", "update"], Render: NoteToolCallRenderer as never }],
  extractAllowlistTarget: (call) => {
    const binding = call.toolBinding;
    if (binding?.entity !== "notes.note" || !["create", "update"].includes(binding.operation)) return null;
    const action = `${binding.entity}.${binding.operation}`;
    return { action, targetType: "tool_action", targetId: action, targetLabel: `${binding.operation === "create" ? "Create" : binding.operation === "merge" ? "Merge" : "Update"} note` };
  },});

const legacyRenderers: readonly AgentHistoryRendererRegistration[] = [
  { id: "notes-legacy-create", moduleId: "notes", match: (block) => typeof block.toolName === "string" && (toolNamesEquivalent(block.toolName, "notes.create")), Render: NoteToolCallRenderer as never },
  { id: "notes-legacy-update", moduleId: "notes", match: (block) => typeof block.toolName === "string" && (toolNamesEquivalent(block.toolName, "notes.update")), Render: NoteToolCallRenderer as never },
  { id: "notes-legacy-template.apply", moduleId: "notes", match: (block) => typeof block.toolName === "string" && (toolNamesEquivalent(block.toolName, "notes.template.apply")), Render: NoteToolCallRenderer as never },
];

if (!moduleDefinition.agent?.historyRenderers) throw new Error("notes tool renderers missing");

export const NotesModule = {
  ...moduleDefinition,
  agent: { ...moduleDefinition.agent, historyRenderers: [...moduleDefinition.agent.historyRenderers, ...legacyRenderers] },
};
