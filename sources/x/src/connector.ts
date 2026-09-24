// ConnectorConfig assembly for the X connector — kept separate from main.ts so
// tests (and @magnis/testkit/source's runSourceContract) can import the exact
// config the host talks to. `fetchFn` is injectable for tests; production uses
// the global fetch. Mirrors the google connector's buildConnectorConfig shape.

import type { ConnectorConfig } from "@magnis/connector-sdk";
import type { FetchLike } from "./api";
import { fixtureFetch } from "./fixture";
import { fetchX } from "./surfaces/x/fetch";
import { probeXAuth } from "./probe";
import { SURFACE_X } from "./schema";

/**
 * Build the X connector config. Read-only: the host passes the opt-in handle
 * set and the app-only bearer via _meta; this fetches profiles and recent
 * tweets. There is no magnis.execute command surface.
 *
 * @tested-by: tst_x_cert_001
 * @invariant: certification uses only its explicit captured transport; an
 * absent fixture selector preserves the production X transport unchanged.
 */
function runtimeFetch(): FetchLike {
  return process.env.X_FIXTURE_FILE === undefined ? fetch : fixtureFetch;
}

export function buildConnectorConfig(fetchFn: FetchLike = runtimeFetch()): ConnectorConfig {
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
