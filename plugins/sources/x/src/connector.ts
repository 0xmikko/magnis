// ConnectorConfig assembly for the X connector — kept separate from main.ts so
// tests (and @magnis/testkit/source's runSourceContract) can import the exact
// config the host talks to. `fetchFn` is injectable for tests; production uses
// the global fetch. Mirrors the google connector's buildConnectorConfig shape.

import type { ConnectorConfig } from "@magnis/connector-sdk";
import type { FetchLike } from "./api";
import { fetchX } from "./surfaces/x/fetch";
import { probeXAuth } from "./probe";
import { SURFACE_X } from "./schema";

/** Build the X connector config. Read-only: the host passes the opt-in handle
 * set and the app-only bearer via _meta; this fetches profiles +
 * recent tweets. There is no magnis.execute command surface. S3: the friend
 * import (`contacts` surface, x:social envelopes) is deleted — a handle is a
 * mutable key, and the hub it minted could never be re-identified. */
export function buildConnectorConfig(fetchFn: FetchLike = fetch): ConnectorConfig {
  return {
    name: "x",
    version: "0.1.0",
    surfaces: [SURFACE_X],
    intervalSecs: 300,
    fetch: (args) => fetchX(args, fetchFn),
    // ProbeAuth — see probe.ts for the unit-tested probe contract.
    probeAuth: (meta) => probeXAuth(meta, fetchFn),
  };
}
