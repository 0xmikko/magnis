/** Shared Entity and Link provenance: canonical records and derived statements
 * supported by evidence, confidence and temporal validity.
 *
 * @tested-by: tst_bts_core_link_010
 */
import { z } from "zod";
/** RFC3339 with offset — the spelling the graph's own compiler pins. */
export type DateTimeUtc = string;
/** Canonical records preserve source identity; derived statements express an
 * inference. Human approval strengthens a statement without changing its origin. */
export type Origin = "canonical" | "derived";
/** The connector's stamp: WHICH connector, on WHICH account, and the source
 *  system's own id. `account` is present on every stamped row, so it is
 *  required: a canonical row is always a sync write. `externalId` is the
 *  idempotency key — a re-sync lands on the same entity through it. A derived
 *  row has evidence instead of a source stamp. A canonical link carries no
 *  stamp of its own; its provenance IS
 *  its `from` entity's `source`. */
export declare const SourceRefSchema: z.ZodObject<{
    source: z.ZodString;
    account: z.ZodString;
    externalId: z.ZodString;
}, z.core.$strict>;
export type SourceRef = z.output<typeof SourceRefSchema>;
/** Parse a stored timestamp to epoch MICROSECONDS — the module's currency.
 *
 * The parse twin of `formatRfc3339Micros`, replacing the two rival readers
 * (`dataset/time.ts` and `graph/repo-common.ts`): it accepts the union of
 * their inputs and agrees with each to the microsecond
 * (`tst_bts_utils_time_parse`). Sub-microsecond digits truncate — this
 * module's precision is what the TEXT columns hold. */
export declare function parseRfc3339Micros(raw: string): number;
/** Every date in these schemas — one definition, reused, never z.string(). */
export declare const DateTimeSchema: z.ZodISODateTime;
/** What a derived row says about its own truth. A canonical row says nothing
 *  of the kind: it is a record, its provenance is the connector's stamp, and
 *  a record does not become false — a claim about the world does. */
export declare const DerivedStatementSchema: z.ZodObject<{
    origin: z.ZodLiteral<"derived">;
    confidence: z.ZodNumber;
    evidence: z.ZodTuple<[z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">], z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">>;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
}, z.core.$strict>;
export type DerivedStatement = z.output<typeof DerivedStatementSchema>;
//# sourceMappingURL=statement.d.ts.map