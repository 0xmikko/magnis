/**
 * Flattens a tool-kind envelope to the legacy card data shape so module
 * entity renderers can read fields directly (e.g. `data.name`).
 *
 * - `{kind:"created", id, schema_id, fields}` → `{id, schema_id, ...fields}`
 * - `{kind:"updated", id, schema_id, changed}` → `{id, schema_id, ...after-values}`
 * - anything else passes through unchanged.
 *
 * Envelope is persisted verbatim in chat history so cards render the same
 * forever — no graph fetches at render time.
 */
export declare function resolveCardFields(data: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
