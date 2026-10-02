import type { SourceStatusListResponse } from "@magnis/sdk";

// @tested-by: tst_plugin_emailstatus_001, tst_plugin_emailstatus_002,
//   tst_plugin_emailstatus_003
export function googleSourceConnected(response: SourceStatusListResponse): boolean {
  const google = response.sources.find((source) => source.sourceId === "google");
  return google?.accounts.some((account) => account.lifecycle === "connected") ?? false;
}
