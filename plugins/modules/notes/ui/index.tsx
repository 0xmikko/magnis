import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";
import { NoteCard, noteHasMore } from "./EntityCards";
import { NoteDetailPanel } from "./NoteDetailPanel";
import { NoteToolCallRenderer } from "./NoteToolCallRenderer";

export const NotesModule = defineModule({
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
    void (async (): Promise<void> => {
      const clientId = crypto.randomUUID();
      const result = await runtime.transport.rpc<{ id: string }>(
        "notes.create",
        { title: "New Note", body: "", client_id: clientId },
      );
      onCreated(result.id);
    })();
  },
  toolCallRenderers: [
    {
      actions: ["update", "create"],
      Render: NoteToolCallRenderer as never,
    },
  ],
  extractAllowlistTarget: (tc) => {
    const n = tc.name;
    if (
      n !== "notes.update" &&
      n !== "notes.create" &&
      n !== "notes_update" &&
      n !== "notes_create"
    )
      return null;
    const args = tc.args as Record<string, unknown>;
    const title = typeof args.title === "string" ? args.title : "note";
    return {
      action: tc.name,
      targetType: "note",
      targetId: title,
      targetLabel: title,
    };
  },
});
