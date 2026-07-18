/**
 * Two-column "Overview" tab for a contact:
 *   - left:  ContactInfoColumn — emails / phones / slack / birthday
 *   - right: Description (markdown facet `contacts.description`)
 *
 * Composes the same `useEntityFacet` hook the standalone Description
 * tab used, so the description content is the SAME facet (no schema
 * drift). When the user types in the right column the
 * 800ms-debounced save fires the same `graph.facet.attach` upsert as
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
import { useEntityFacet } from "@magnis/host/base";
import type { FacetSummary } from "@magnis/host/base";

import { ContactInfoColumn } from "./ContactInfoColumn";

const DESCRIPTION_SCHEMA_ID = "contacts.description";

export interface ContactOverviewProps {
  readonly entityId: string;
  readonly facets: readonly FacetSummary[];
}

export function ContactOverview({
  entityId,
  facets,
}: ContactOverviewProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr] md:gap-6">
      <div>
        <ContactInfoColumn facets={facets} />
      </div>
      <div>
        <DescriptionPanel entityId={entityId} />
      </div>
    </div>
  );
}

function DescriptionPanel({ entityId }: { readonly entityId: string }): JSX.Element {
  const description = useEntityFacet(entityId, DESCRIPTION_SCHEMA_ID);
  const body = (description.data?.body as string) ?? "";
  // @-mention suggestion plumbing — same hook NoteDetail and
  // EntityDetailTabs.DescriptionTab use post-MAG-34 so the editor
  // behaves identically across all surfaces.
  const mentionSuggestion = useEditorMentionSuggestion();

  const [editing, setEditing] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const localRef = useRef(body);
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
      description.save({ body: markdown });
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
