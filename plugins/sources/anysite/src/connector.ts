// ConnectorConfig assembly for the anysite connector — kept separate from
// main.ts so tests (and @magnis/testkit/source's runSourceContract) can import
// the exact config the host talks to. `fetchFn` is injectable for tests;
// production uses the global fetch. Mirrors the x/google connector shape.

import type { ConnectorConfig } from "@magnis/connector-sdk";
import type { FetchLike } from "./api";
import { fetchLinkedIn } from "./surfaces/linkedin/fetch";
import { probeLinkedInAuth } from "./probe";

/** Build the anysite connector config. Read-only: the shared-provider key
 * arrives via _meta; this fetches tracked KOL profiles + their posts. */
export function buildConnectorConfig(fetchFn: FetchLike = fetch): ConnectorConfig {
  return {
    name: "anysite",
    version: "0.1.0",
    surfaces: ["linkedin"],
    intervalSecs: 600,
    fetch: (args) => fetchLinkedIn(args, fetchFn),
    probeAuth: (meta) => probeLinkedInAuth(meta, fetchFn),
  };
}
