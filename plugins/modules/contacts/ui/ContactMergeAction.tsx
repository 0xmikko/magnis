import { useState } from "react";
import type { ChangeEvent, JSX } from "react";
import { ActionButton, Icon } from "@magnis/host/ui";
import type { AppRuntime } from "@magnis/host/runtime";
import { MergeTable, extractPreview } from "./ContactMergeRenderer";
import type { MergePreviewData } from "./ContactMergeRenderer";

interface MergeCandidate {
  readonly id: string;
  readonly name: string;
}

interface ContactListResponse {
  readonly items: readonly MergeCandidate[];
}

export interface ContactMergeActionProps {
  readonly entityId: string;
  readonly runtime: AppRuntime;
}

export function ContactMergeAction({
  entityId,
  runtime,
}: ContactMergeActionProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<readonly MergeCandidate[]>([]);
  const [retiredId, setRetiredId] = useState("");
  const [preview, setPreview] = useState<MergePreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [merged, setMerged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function errorText(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
  }

  async function loadPreview(candidateId: string): Promise<void> {
    setRetiredId(candidateId);
    setPreview(null);
    setError(null);
    setLoading(true);
    try {
      const raw = await runtime.transport.rpc("contacts.merge_preview", {
        survivor_id: entityId,
        retired_id: candidateId,
      });
      const next = extractPreview(raw);
      if (!next) throw new Error("contacts.merge_preview returned an invalid preview");
      setPreview(next);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }

  async function openMerge(): Promise<void> {
    setOpen(true);
    setMerged(false);
    setError(null);
    setLoading(true);
    try {
      const response = await runtime.transport.rpc<ContactListResponse>("contacts.list", {
        limit: 100,
        offset: 0,
      });
      const available = response.items.filter((contact) => contact.id !== entityId);
      setCandidates(available);
      const first = available[0];
      if (!first) {
        throw new Error("Another contact is required to merge");
      }
      await loadPreview(first.id);
    } catch (reason) {
      setError(errorText(reason));
      setLoading(false);
    }
  }

  async function confirmMerge(): Promise<void> {
    if (!retiredId || !preview || merging) return;
    setMerging(true);
    setError(null);
    try {
      // @tested-by: tst_fe_contacts_browser_002
      await runtime.transport.rpc("contacts.merge", {
        survivor_id: entityId,
        retired_id: retiredId,
      });
      await runtime.queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setMerged(true);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setMerging(false);
    }
  }

  function close(): void {
    setOpen(false);
    setCandidates([]);
    setRetiredId("");
    setPreview(null);
    setMerged(false);
    setError(null);
  }

  function selectCandidate(event: ChangeEvent<HTMLSelectElement>): void {
    void loadPreview(event.target.value);
  }

  return (
    <>
      <ActionButton
        label="Merge contact"
        icon="users"
        size="sm"
        onClick={() => {
          void openMerge();
        }}
      />

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
          <div className="mx-4 w-full max-w-4xl rounded-xl border border-edge bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-edge px-5 py-4">
              <div className="flex items-center gap-2">
                <Icon name="users" size={16} />
                <h2 className="m-0 text-[15px] font-semibold text-content">Merge contacts</h2>
              </div>
              <button type="button" aria-label="Close merge" onClick={close}>Close</button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {candidates.length > 0 && !merged && (
                <label className="block space-y-1 text-xs text-content-secondary">
                  Merge selected contact with
                  <select
                    aria-label="Merge with"
                    value={retiredId}
                    onChange={selectCandidate}
                    disabled={loading || merging}
                    className="block w-full rounded-lg border border-edge bg-surface-secondary px-3 py-2 text-content"
                  >
                    {candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {loading && <p className="text-xs text-content-secondary">Loading preview...</p>}
              {error && <p className="text-xs text-red-400">{error}</p>}
              {preview && !merged && <MergeTable preview={preview} />}
              {merged && (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <Icon name="circle-check" size={16} />
                  Contacts merged successfully
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-edge px-5 py-4">
              <button type="button" onClick={close}>{merged ? "Close" : "Cancel"}</button>
              {!merged && (
                <button
                  type="button"
                  onClick={() => {
                    void confirmMerge();
                  }}
                  disabled={!preview || loading || merging}
                  className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  {merging ? "Merging..." : "Confirm Merge"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
