import { runConnector } from "@magnis/connector-sdk";
import { buildConnectorConfig } from "./connector";

// Entry point — the host spawns `bun run src/main.ts` (cwd = this dir). The
// config lives in ./connector so tests drive the exact handlers.
await runConnector(buildConnectorConfig());
