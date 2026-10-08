import { runConnector } from "@magnis/connector-sdk";
import { buildConnectorConfig } from "./connector";
import { liveTransport } from "./http";

// Entry point — the host spawns `bun run src/main.ts` (cwd = this dir). The
// config lives in ./connector so tests drive the exact handlers.
await runConnector(buildConnectorConfig(liveTransport()));
