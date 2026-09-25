// Email plugin — schema-id constants. Deduped between `module/service.ts`,
// `module/helpers.ts` and the module tests (the single spelling of each
// namespace string). The schemas/ files are the source of truth for REGISTRATION
// (registered natively at install); these consts are for read/write
// call sites only.
import type { BatchEntityInput } from "@magnis/plugin-sdk";

/** Message entity schema. */
export const MESSAGE_SCHEMA = "email.message";
/** Address entity schema (the cross-module email.address hub). */
export const ADDRESS_SCHEMA = "email.address";

/** The shared address node shape used by sync batches without a nested module RPC. */
export function addressBatchEntity(key: string, address: string, displayName: string | null): BatchEntityInput {
  const lower = address.trim().toLowerCase();
  return {
    key,
    schema_id: ADDRESS_SCHEMA,
    name: lower,
    idx: lower,
    anchor: `email:address:${lower}`,
    properties: { address: lower, ...(displayName ? { display_name: displayName } : {}) },
  };
}

// S5: the details records are frozen archive — the message and address
// dictionaries are the record. The schemas stay registered (no schema is ever
// removed); nothing reads or writes them, so no constant points at them.
