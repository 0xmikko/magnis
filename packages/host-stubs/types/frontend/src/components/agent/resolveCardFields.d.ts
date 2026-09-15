/**
 * Facade — the envelope flattening moved to `@magnis/client-core`
 * (WS-1 consolidation, A-5) so CLI card projections use the SAME rules
 * the web cards render with. This file stays as the web import path.
 */
export { resolveCardFields } from "@magnis/client-core";
