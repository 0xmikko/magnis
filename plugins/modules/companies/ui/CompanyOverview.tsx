/**
 * Two-column "Overview" tab for a company. Mirrors `ContactOverview`:
 *   - left:  CompanyInfoColumn — website / industry / size / location /
 *            founded / stage / funding / emails / phones / external links
 *   - right: Description (markdown facet `companies.description`)
 *
 * Same Markdown editor pattern as the contact Overview — single editor
 * toggling readOnly on the pencil click, no layout jump, @-mention
 * suggestions wired through.
 */
import { useCallback, useRef, useState } from "react";
import type { JSX } from "react";

import { Icon, IconButton, Stack, Text } from "@magnis/host/ui";
import { MarkdownEditor, useEditorMentionSuggestion } from "@magnis/host/markdown";
import { useEntityFacet } from "@magnis/host/base";
import type { FacetSummary } from "@magnis/host/base";

import { CompanyInfoColumn, hasCompanyInfo } from "./CompanyInfoColumn";

const DESCRIPTION_SCHEMA_ID = "companies.description";

export interface CompanyOverviewProps {
  readonly entityId: string;
  readonly facets: readonly FacetSummary[];
}

export function CompanyOverview({
  entityId,
  facets,
}: CompanyOverviewProps): JSX.Element {
  // Description panel is always rendered with its card chrome.
  // When the company has no info-column rows, the panel takes the
  // full width; otherwise we drop into the 3fr/2fr grid with the
  // info rail on the right.
  if (!hasCompanyInfo(facets)) {
    return <DescriptionPanel entityId={entityId} />;
  }
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[3fr_2fr] md:gap-6">
      <div>
        <DescriptionPanel entityId={entityId} />
      </div>
      <div>
        <CompanyInfoColumn facets={facets} />
      </div>
    </div>
  );
}

function DescriptionPanel({ entityId }: { readonly entityId: string }): JSX.Element {
  const description = useEntityFacet(entityId, DESCRIPTION_SCHEMA_ID);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const body = (description.data?.body as string) ?? "";
  const mentionSuggestion = useEditorMentionSuggestion();

  const [editing, setEditing] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const localRef = useRef(body);
  localRef.current = body;

  const handleToggle = useCallback(() => {
    setEditing((m) => {
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
