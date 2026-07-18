import { useState, type JSX, type KeyboardEvent } from "react";
import { Icon, IconButton } from "@magnis/host/ui";
import type { AppRuntime } from "@magnis/host/runtime";

// LinkedIn list-pane "+" (linkedin-add-flow LA-3, reworks S5/INV-6): opens a
// DIALOG — paste a profile URL or @handle → contacts.track_social_profile
// finds-or-creates the contact and turns tracking on. The list shows the new
// profile IMMEDIATELY as a pending "Syncing…" row (LA-2); the real profile
// replaces it on the next sync cycle. The dialog stays open after a
// successful add — pasting several URLs in a row is the common flow.
// LinkedIn ONLY — X friends come from the API import, not manual entry.
export function AddProfileAction({
  runtime,
}: {
  runtime: AppRuntime;
  onCreated?: (id: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  function close(): void {
    setOpen(false);
    setValue("");
    setError(null);
    setAdded(null);
  }

  async function submit(): Promise<void> {
    const raw = value.trim();
    if (!raw || busy) return;
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      const result = await runtime.transport.rpc<{ handle: string }>(
        "contacts.track_social_profile",
        { platform: "linkedin", url_or_handle: raw },
      );
      setValue("");
      setAdded(result.handle);
      // The pending row appears instantly: tracking is already in the DB and
      // profiles.list prepends tracked-not-synced handles (LA-2).
      void runtime.queryClient.invalidateQueries({ queryKey: ["linkedin"] });
      void runtime.queryClient.invalidateQueries({ queryKey: ["contacts"] });
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes("invalid_url")
          ? "Not a LinkedIn profile — paste linkedin.com/in/… or a handle"
          : "Could not track this profile",
      );
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") void submit();
    if (e.key === "Escape") close();
  }

  return (
    <>
      <IconButton
        variant="ghost"
        label="Add profile"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Icon name="plus" size={15} />
      </IconButton>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-lg mx-4 rounded-xl bg-surface border border-edge shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-[15px] font-semibold text-content m-0">
                Add LinkedIn profile
              </h2>
              <button
                type="button"
                onClick={close}
                className="w-8 h-8 rounded-lg bg-transparent border-none text-content-secondary hover:text-content hover:bg-surface-hover cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="px-5 pb-5 space-y-3">
              <p className="text-[13px] text-content-secondary m-0">
                Paste a profile URL (linkedin.com/in/…) or a handle. The person
                appears in the list immediately and their posts arrive with the
                next sync. Tracking costs API credits on every cycle.
              </p>

              <input
                aria-label="Profile URL or handle"
                autoFocus
                value={value}
                disabled={busy}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                onKeyDown={onKeyDown}
                placeholder="https://www.linkedin.com/in/…"
                className="w-full rounded-lg bg-surface-secondary border border-edge px-3 py-2.5 text-sm text-content focus:outline-none focus:border-accent"
              />

              {error && <p className="text-xs text-red-400 m-0">{error}</p>}
              {added && !error && (
                <p className="text-xs text-green-400 m-0">
                  Added @{added} — syncing… Paste another to keep going.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-edge">
              <button
                type="button"
                onClick={close}
                className="text-xs px-4 py-2 rounded-lg border border-edge text-content-secondary hover:text-content hover:border-edge-strong transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => { void submit(); }}
                disabled={busy || !value.trim()}
                className="text-xs px-4 py-2 rounded-lg bg-accent text-white font-medium disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
