import type { SourceStatusListResponse } from "@magnis/client-core";

// @tested-by: tst_plugin_emailstatus_001, tst_plugin_emailstatus_002,
//   tst_plugin_emailstatus_003
export function googleSourceConnected(response: SourceStatusListResponse): boolean {
  const google = response.sources.find((source) => source.source_id === "google");
  return google?.accounts.some((account) => account.state.state === "connected") ?? false;
}
