// Email plugin — schema-id constants. Deduped between `module/service.ts`,
// `module/helpers.ts` and the module tests (the single spelling of each
// namespace string). The schemas/ files are the source of truth for REGISTRATION
// (registered natively at install); these consts are for read/write
// call sites only.
import type { GraphService, SyncableBatchEntityInput } from "@magnis/plugin-sdk";
import type { BatchRef } from "@magnis/sdk";

/** Message entity schema. */
export const MESSAGE_SCHEMA = "email.message";
/** Address entity schema (the cross-module email.address hub). */
export const ADDRESS_SCHEMA = "email.address";

/** The shared address node shape used by sync batches without a nested module RPC. */
export function addressBatchEntity(key: string, address: string, displayName: string | null, syncEnabled: boolean): SyncableBatchEntityInput {
  const lower = address.trim().toLowerCase();
  return {
    key,
    schemaId: ADDRESS_SCHEMA,
    syncEnabled,
    name: lower,
    idx: lower,
    date: null,
    externalId: `email:address:${lower}`,
    properties: { address: lower, ...(displayName ? { display_name: displayName } : {}) },
  };
}

/** The batch part that resolves `addresses` (lowercased address → display
 * name) to the shared address nodes. An address the graph holds is a ref and
 * keeps its saved synchronization choice; a new one is created with the email
 * owner's rule for new senders, and a missing or invalid rule throws. Keys are
 * `addr:<address>`, so the caller links to them in the same batch.
 * @tested-by: tst_module_addressbook_email_sync_001
 * @tested-by: tst_module_meetings_sync_002 */
export async function addressFragment(
  graph: Pick<GraphService, "findByExternalIds" | "moduleSettings">,
  addresses: ReadonlyMap<string, string | null>,
): Promise<{ entities: SyncableBatchEntityInput[]; refs: BatchRef[] }> {
  const all = [...addresses.keys()];
  if (all.length === 0) return { entities: [], refs: [] };
  const ids = await graph.findByExternalIds(all.map((address) => `email:address:${address}`));
  if (ids.length !== all.length) throw new Error("Email address lookup length mismatch");
  const refs = all.flatMap((address, index) => ids[index] === null ? [] : [{ key: `addr:${address}`, externalId: `email:address:${address}` }]);
  const missing = all.filter((_, index) => ids[index] === null);
  if (missing.length === 0) return { entities: [], refs };
  const rule = (await graph.moduleSettings(ADDRESS_SCHEMA)).newSenderSyncEnabled;
  if (rule !== "true" && rule !== "false") throw new Error("Email newSenderSyncEnabled setting is missing or invalid");
  return {
    entities: missing.map((address) => addressBatchEntity(`addr:${address}`, address, addresses.get(address) ?? null, rule === "true")),
    refs,
  };
}

// S5: the details records are frozen archive — the message and address
// dictionaries are the record. The schemas stay registered (no schema is ever
// removed); nothing reads or writes them, so no constant points at them.
