// ConnectorConfig assembly for the X connector — kept separate from main.ts so
// tests (and @magnis/testkit/source's runSourceContract) can import the exact
// config the host talks to. `fetchFn` is injectable for tests; production uses
// the global fetch. Mirrors the google connector's buildConnectorConfig shape.

import type { ConnectorConfig } from "@magnis/connector-sdk";
import type { FetchLike } from "./api";
import { fetchXContacts } from "./contacts";
import { fetchX } from "./fetch";
import { probeXAuth } from "./probe";
import { SURFACE_CONTACTS, SURFACE_X } from "./schema";

/** Build the X connector config. Read-only: the host passes the opt-in handle
 * set (DEC-8) and the app-only bearer via _meta (DEC-6); this fetches profiles +
 * recent tweets. The friend import runs through the `contacts` surface (plan §7)
 * — there is no magnis.execute command surface. */
export function buildConnectorConfig(fetchFn: FetchLike = fetch): ConnectorConfig {
  return {
    name: "x",
    version: "0.1.0",
    surfaces: [SURFACE_X, SURFACE_CONTACTS],
    intervalSecs: 300,
    // Surface router (plan §7): "x" = tracked profiles + posts; "contacts" =
    // the following import as social_contact envelopes (cursor-seeded).
    fetch: (args) =>
      args.surface === SURFACE_CONTACTS ? fetchXContacts(args, fetchFn) : fetchX(args, fetchFn),
    // ProbeAuth (plan §2.4) — see probe.ts (unit-tested F3 contract).
    probeAuth: (meta) => probeXAuth(meta, fetchFn),
  };
}
