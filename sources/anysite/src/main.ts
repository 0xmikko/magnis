import { runConnector } from "@magnis/connector-sdk";
import { buildConnectorConfig } from "./connector";

// Entry point — host spawns `bun run src/main.ts` (cwd = this dir).
// Read-only anysite.io connector (LinkedIn surface today). The ConnectorConfig
// lives in ./connector so tests can drive the exact handlers the host talks to.
await runConnector(buildConnectorConfig());
