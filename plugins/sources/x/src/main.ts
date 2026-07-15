import { runConnector } from "@magnis/connector-sdk";
import { fetchX } from "./fetch";
import { fetchXContacts } from "./contacts";
import { probeXAuth } from "./probe";

// Entry point — host spawns `bun run src/main.ts` (cwd = this dir, DEC-10).
// Read-only X connector: the host passes the opt-in handle set (DEC-8) and the
// app-only bearer via _meta (DEC-6); this fetches profiles + recent tweets.
// The friend import runs through the `contacts` surface (plan §7) — there is
// no magnis.execute command surface anymore.
await runConnector({
  name: "x",
  version: "0.1.0",
  surfaces: ["x", "contacts"],
  intervalSecs: 300,
  // Surface router (plan §7): "x" = tracked profiles + posts; "contacts" =
  // the following import as social_contact envelopes (cursor-seeded).
  fetch: (args) =>
    args.surface === "contacts"
      ? fetchXContacts(args, fetch as never)
      : fetchX(args, fetch as never),
  // ProbeAuth (plan §2.4) — see probe.ts (unit-tested F3 contract).
  probeAuth: (meta) => probeXAuth(meta, fetch as never),
});
