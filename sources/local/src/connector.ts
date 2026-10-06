// ConnectorConfig assembly for the local-notes connector — kept separate from
// main.ts so tests can import the exact config the host talks to. Local is a
// filesystem source (no HTTP), so there is no injectable fetch.

import type { ConnectorConfig } from "@magnis/connector-sdk";
import { fetchLocalNotes } from "./surfaces/notes/fetch";

/** Build the local-notes connector config: scans a notes directory and emits
 * each note as an envelope on the `notes` surface. */
export function buildConnectorConfig(): ConnectorConfig {
  return {
    name: "magnis-local",
    version: "0.1.0",
    surfaces: ["notes"],
    intervalSecs: 60,
    fetch: fetchLocalNotes,
  };
}
