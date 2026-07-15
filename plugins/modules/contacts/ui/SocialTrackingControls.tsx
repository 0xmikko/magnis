import { useState, type JSX } from "react";
import { useAppRuntime } from "@magnis/host/runtime";
import { useSocialTrackingQuery, socialTrackingKey, type SocialTrackingState } from "./queries";

type Platform = "x" | "linkedin";

const LABEL: Record<Platform, string> = { x: "Track on X", linkedin: "Track on LinkedIn" };

/** Per-contact opt-in for social tracking (DEC-9). Toggling a platform on (with
 * a handle) places that handle in the sync scheduler's tracked set so the X /
 * LinkedIn connectors fetch it; off removes it (INV-1). One row per platform. */
export function SocialTrackingControls({ entityId }: { readonly entityId: string }): JSX.Element {
  const runtime = useAppRuntime();
  const { data } = useSocialTrackingQuery(entityId);
  const tracking: SocialTrackingState = data ?? {};

  return (
    <div className="social-tracking" data-testid="social-tracking">
      {(["x", "linkedin"] as const).map((platform) => (
        <PlatformRow
          key={platform}
          platform={platform}
          entityId={entityId}
          tracked={platform === "x" ? !!tracking.tracked_x : !!tracking.tracked_linkedin}
          handle={(platform === "x" ? tracking.x_handle : tracking.linkedin_handle) ?? ""}
          onSaved={() => {
            void runtime.queryClient?.invalidateQueries({ queryKey: socialTrackingKey(entityId) });
          }}
        />
      ))}
    </div>
  );
}

function PlatformRow({
  platform,
  entityId,
  tracked,
  handle,
  onSaved,
}: {
  readonly platform: Platform;
  readonly entityId: string;
  readonly tracked: boolean;
  readonly handle: string;
  readonly onSaved: () => void;
}): JSX.Element {
  const runtime = useAppRuntime();
  const [draftHandle, setDraftHandle] = useState(handle);
  const [busy, setBusy] = useState(false);

  async function setTracking(next: boolean): Promise<void> {
    setBusy(true);
    try {
      await runtime.transport.rpc("contacts.set_social_tracking", {
        id: entityId,
        platform,
        tracked: next,
        // Only send a handle when one is present (the tool keeps the existing one
        // otherwise) — never overwrite a stored handle with an empty string.
        ...(draftHandle.trim() ? { handle: draftHandle.trim() } : {}),
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const inputId = `social-${platform}-handle`;
  return (
    <div className="social-tracking-row">
      <label>
        <input
          type="checkbox"
          checked={tracked}
          disabled={busy}
          aria-label={LABEL[platform]}
          onChange={(e) => void setTracking(e.target.checked)}
        />
        {LABEL[platform]}
      </label>
      <input
        id={inputId}
        type="text"
        value={draftHandle}
        placeholder={`${platform} handle`}
        aria-label={`${platform} handle`}
        onChange={(e) => setDraftHandle(e.target.value)}
        onBlur={() => {
          // Persist a handle edit while tracked without flipping the toggle.
          if (tracked && draftHandle.trim() !== handle) void setTracking(true);
        }}
      />
    </div>
  );
}
