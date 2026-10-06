import { runConnector } from "@magnis/connector-sdk";

import { buildConnectorConfig } from "./connector";

await runConnector(buildConnectorConfig());
