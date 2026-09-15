import type { JSX } from "react";

export interface SourceAuthScreenProps {
  sourceId: string;
}

/** Fixture OAuth uses the same host-owned browser redirect as production OAuth. */
export default function FixtureOAuthAuthScreen({
  sourceId,
}: SourceAuthScreenProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-content-secondary">
        Start the deterministic OAuth fixture ceremony.
      </p>
      <button
        type="button"
        onClick={() => {
          window.location.assign(`/auth/sources/${sourceId}/start`);
        }}
        className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black cursor-pointer border-none"
      >
        Connect fixture OAuth
      </button>
    </div>
  );
}
