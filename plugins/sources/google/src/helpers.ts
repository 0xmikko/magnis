// google connector — free coercers/parse helpers, factored out of connector.ts
// so main.ts / connector.ts stay entry + config only (the source target layout).

/** Read an optional string off the verbatim tools/call `raw` args — the calendar
 *  window's `time_min`/`time_max`, which the Rust twin reads straight off the
 *  action payload. Same semantics as the plugin-sdk `str` coercer, kept LOCAL:
 *  sources depend only on `@magnis/connector-sdk`, and importing the module SDK
 *  here would be a new source→plugin-sdk coupling with no precedent (flagged for
 *  the owner — see the source-pilot report). */
export function rawStr(raw: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = raw?.[key];
  return typeof v === "string" ? v : undefined;
}
