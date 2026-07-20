/**
 * Google connect screen (per-source auth UI).
 *
 * OAuth2 is a pure browser round-trip: the HOST owns the ceremony, so this screen
 * only needs to send the browser to `GET /auth/sources/google/start`, which
 * 302-redirects to Google's consent page and (after callback) back into the app
 * with `?source_connected=google`. No secrets, no tokens, no isolate involvement
 * touch this component. Plain elements + Tailwind only (no
 * `@magnis/host/ui` dependency, which the sealed-isolate shim can't fully provide).
 *
 * NOTE: for oauth2, the generic `SourceConnect` host component performs the
 * navigation directly, so this screen is the catalog fallback / non-SPA entry.
 */
import type { JSX } from "react";

export interface SourceAuthScreenProps {
  sourceId: string;
}

export default function GoogleAuthScreen({
  sourceId,
}: SourceAuthScreenProps): JSX.Element {
  const start = (): void => {
    window.location.assign(`/auth/sources/${sourceId}/start`);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-content-secondary">
        Connect your Google account to sync Gmail, Calendar and Contacts. You'll
        approve access on Google's consent screen and return here.
      </p>
      <button
        type="button"
        onClick={start}
        className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black cursor-pointer border-none"
      >
        Connect Google
      </button>
    </div>
  );
}
