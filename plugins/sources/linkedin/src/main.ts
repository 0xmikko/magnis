import { runConnector } from "@magnis/connector-sdk";
import { fetchLinkedIn } from "./fetch";
import { probeLinkedInAuth } from "./probe";

// Entry point — host spawns `bun run src/main.ts` (cwd = this dir, DEC-10).
// Read-only LinkedIn connector via anysite.io: host passes the opt-in handle set
// (DEC-8) + the anysite key via _meta (DEC-6).
await runConnector({
  name: "linkedin",
  version: "0.1.0",
  surfaces: ["linkedin"],
  intervalSecs: 600,
  fetch: (args) => fetchLinkedIn(args, fetch),
  // ProbeAuth (plan §2.4) — see probe.ts (unit-tested F3 contract).
  probeAuth: (meta) => probeLinkedInAuth(meta, fetch),
});
