/**
 * Two-column "Overview" tab for a contact:
 *   - left:  ContactInfoColumn — emails / phones / slack / birthday
 *   - right: Description (the hub dictionary's `description` key)
 *
 * Composes the same `useEntityProperty` hook the standalone Description
 * tab uses, so the description content is the SAME key (no schema
 * drift). When the user types in the right column the
 * 800ms-debounced save fires the same `graph.record.attach` upsert as
 * before — switching tab structure is a pure UI change.
 *
 * The Description tab itself is suppressed from `EntityDetailTabs`
 * tab list when this component is wired in (Overview owns the
 * description now).
 */
import { useCallback, useRef, useState } from "react";
import type { JSX } from "react";

import { Icon, IconButton, Stack, Text } from "@magnis/host/ui";
import { MarkdownEditor } from "@magnis/host/markdown";
import { useEditorMentionSuggestion } from "@magnis/host/markdown";
import { useEntityProperty } from "@magnis/host/base";
import { useAppRuntime } from "@magnis/host/runtime";

import { ContactInfoColumn } from "./ContactInfoColumn";
import { ContactMergeAction } from "./ContactMergeAction";
import { useContactDetailQuery } from "./queries";


export interface ContactOverviewProps {
  readonly entityId: string;
}

export function ContactOverview({ entityId }: ContactOverviewProps): JSX.Element {
  // S3 (§5.1): the composed card sections ride the detail DTO.
  const runtime = useAppRuntime();
  const detail = useContactDetailQuery(entityId);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ContactMergeAction entityId={entityId} runtime={runtime} />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr] md:gap-6">
        <div>
          <ContactInfoColumn
            emails={detail.data?.emails}
            phones={detail.data?.phones}
            replicas={detail.data?.replicas}
          />
        </div>
        <div>
          <DescriptionPanel entityId={entityId} />
        </div>
      </div>
    </div>
  );
}

function DescriptionPanel({ entityId }: { readonly entityId: string }): JSX.Element {
  const description = useEntityProperty(entityId, "description");
  const body = description.value;
  // @-mention suggestion plumbing — same hook NoteDetail and
  // EntityDetailTabs.DescriptionTab use post-MAG-34 so the editor
  // behaves identically across all surfaces.
  const mentionSuggestion = useEditorMentionSuggestion();

  const [editing, setEditing] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const localRef = useRef(body);
  // eslint-disable-next-line react-hooks/refs -- latest-ref pattern: storing the current body for the editor's uncontrolled read; not consumed during this render.
  localRef.current = body;

  const handleToggle = useCallback(() => {
    setEditing((m) => {
      // Remount on either direction so the freshly-saved body
      // becomes initialValue on the next render.
      setEditorKey((k) => k + 1);
      return !m;
    });
  }, []);

  const handleChange = useCallback(
    (markdown: string) => {
      description.save(markdown);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [description.save],
  );

  if (description.isLoading) {
    return (
      <Stack gap={3} align="center" className="py-12">
        <Text variant="body" color="tertiary">Loading…</Text>
      </Stack>
    );
  }

  const isEmpty = !body.trim();

  // Reset Milkdown's `.ProseMirror` padding (`1rem 1.5rem`) inside
  // the Overview card — the card already supplies its own `px-5
  // py-3` and the doubled padding was leaving a giant top gap.
  const editorClass = "[&_.ProseMirror]:!p-0 [&_.milkdown-editor-wrapper]:!p-0";

  return (
    <div className="rounded-2xl bg-surface-secondary/50 px-5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <Text variant="title" className="text-sm font-semibold">
          Description
        </Text>
        <IconButton variant="ghost" onClick={handleToggle} label={editing ? "Done" : "Edit"}>
          <Icon name={editing ? "check" : "edit"} size={14} />
        </IconButton>
      </div>
      {/* Single MarkdownEditor — toggling `readOnly` keeps layout
          identical between view and edit (no toolbar bar, no
          padding jump). */}
      {isEmpty && !editing ? (
        <Text variant="body" color="tertiary">
          No description yet.
        </Text>
      ) : (
        <MarkdownEditor
          key={`${editing ? "edit" : "view"}-${String(editorKey)}`}
          initialValue={body}
          onChange={editing ? handleChange : (): void => { /* read-only */ }}
          placeholder="Add a description…"
          readOnly={!editing}
          autoFocus={editing}
          mentionSuggestion={editing ? mentionSuggestion : undefined}
          className={editorClass}
        />
      )}
    </div>
  );
}
