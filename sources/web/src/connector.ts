// The CommandConnectorConfig for the Web Source — kept apart from main.ts so
// tests drive the exact handlers the host talks to. It answers commands only:
// `read` and `search`, with no login, no sync and no state. main.ts hands it
// the network transport.
import { ConnectorError, type CommandConnectorConfig } from "@magnis/connector-sdk";

import type { WebReadParams, WebSearchParams } from "../../../modules/web/types";
import { readUrl } from "./http";
import { searchWeb } from "./search";

type Transport = Parameters<typeof readUrl>[1];

function invalid(message: string): never {
  throw new ConnectorError(message, { kind: "validation" });
}

function stringOrNull(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  if (value === null || typeof value === "string") return value;
  return invalid(`read needs ${key} as a string or null`);
}

/** The `read` arguments the Web module sends, checked before any request. */
function readParamsOf(args: Record<string, unknown>): WebReadParams {
  if (typeof args.url !== "string") invalid("read needs a url");
  if (typeof args.forceRefresh !== "boolean") invalid("read needs forceRefresh");
  return { url: args.url, etag: stringOrNull(args, "etag"), lastModified: stringOrNull(args, "lastModified"), forceRefresh: args.forceRefresh };
}

function searchParamsOf(args: Record<string, unknown>): WebSearchParams {
  if (typeof args.query !== "string") invalid("search needs a query");
  if (typeof args.limit !== "number") invalid("search needs a limit");
  return { query: args.query, limit: args.limit };
}

export function buildConnectorConfig(transport: Transport): CommandConnectorConfig {
  return {
    name: "web",
    version: "1.0.0",
    surfaces: ["web"],
    execute: {
      read: async (args) => ({ ...await readUrl(readParamsOf(args), transport) }),
      search: async (args) => ({ ...await searchWeb(searchParamsOf(args), transport) }),
    },
  };
}
