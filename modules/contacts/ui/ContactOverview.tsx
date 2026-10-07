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

import { ActionButton, Icon, IconButton, Stack, Text } from "@magnis/host/ui";
import { MarkdownEditor } from "@magnis/host/markdown";
import { useEditorMentionSuggestion } from "@magnis/host/markdown";
import { useEntityProperty } from "@magnis/host/base";
import { useAppRuntime } from "@magnis/host/runtime";

import { ContactInfoColumn } from "./ContactInfoColumn";
import { ContactMergeAction } from "./ContactMergeAction";
import { useQueryClient } from "@tanstack/react-query";
import type { SetSyncEnabledResult, SyncTargetResult } from "@magnis/plugin-sdk";
import type { ContactSyncTarget } from "../types";
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
      {detail.error ? <div role="alert">{detail.error.message}</div> : null}
      {detail.data ? <ContactSyncControls key={entityId} entityId={entityId} targets={detail.data.syncTargets} /> : null}
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

function ContactSyncControls({ entityId, targets }: { readonly entityId: string; readonly targets: readonly ContactSyncTarget[] }): JSX.Element {
  const runtime = useAppRuntime();
  const client = useQueryClient();
  const saving = useRef(false);
  const [results, setResults] = useState<readonly SyncTargetResult[]>([]);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const setSyncEnabled = async (syncEnabled: boolean): Promise<void> => {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError(undefined);
    setResults([]);
    try {
      const response = await runtime.transport.rpc<SetSyncEnabledResult>("contacts.person.setSyncEnabled", { id: entityId, syncEnabled });
      if (response.results.length === 0 && targets.length > 0) throw new Error("No identity synchronization results were returned.");
      setResults(response.results);
      await Promise.all(["contacts", "email", "telegram", "x"].map(key => client.invalidateQueries({ queryKey: [key] })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      saving.current = false;
      setPending(false);
    }
  };

  return <section className="rounded-2xl bg-surface-secondary/50 px-5 py-3" aria-label="Contact synchronization">
    <Text variant="title">Synchronization</Text>
    {targets.length === 0 ? <Text>No supported identities linked.</Text> : <>
      <ul>{targets.map(target => <li key={target.identityId}>
        {target.name}: {target.state.kind === "ready" ? target.state.syncEnabled ? "On" : "Off" : target.state.message}
      </li>)}</ul>
      <div className="flex gap-2 mt-2">
        <ActionButton label="Start synchronization" onClick={() => { void setSyncEnabled(true); }} />
        <ActionButton label="Stop synchronization" onClick={() => { void setSyncEnabled(false); }} />
      </div>
    </>}
    {pending ? <div role="status">Saving…</div> : null}
    {error ? <div role="alert">{error}</div> : null}
    {results.map(result => {
      const name = targets.find(target => target.identityId === result.identityId)?.name ?? result.identityId;
      const message = result.kind === "failed" ? `Not saved: ${result.message}`
        : result.application.kind === "pending" ? "Saved. Applying…" : `Saved, but could not be applied: ${result.application.message}`;
      return <div key={result.identityId} role={result.kind === "failed" || result.application.kind === "failed" ? "alert" : "status"}>{name}: {message}</div>;
    })}
  </section>;
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
