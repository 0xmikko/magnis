/** The statement vocabulary: what a graph row says about where it came from
 * and, for a row a model wrote, how sure it is. `Entity` and `Link` take these
 * in the cutover; this module is additive and nothing existing depends on it
 * yet.
 *
 * @tested-by: tst_bts_core_link_010
 */
import { z } from "zod";
/** RFC3339 with offset — the spelling the graph's own compiler pins. */
export type DateTimeUtc = string;
/** Two kinds of row, and the type says so. The only question that changes how
 *  a row is treated is whether a MODEL decided it, so that is the discriminant.
 *  A person cannot create an entity or a link — no interface offers it; asking
 *  means asking the agent. */
export type Origin = "canonical" | "agent";
/** The connector's stamp: WHICH connector, on WHICH account, and the source
 *  system's own id. `account` is present on every stamped row, so it is
 *  required: a canonical row is always a sync write. `externalId` is the
 *  idempotency key — a re-sync lands on the same entity through it. An agent
 *  row has no stamp and needs no key: an agent write is a decision, not a
 *  re-sync. A canonical link carries no stamp of its own; its provenance IS
 *  its `from` entity's `source`. */
export declare const sourceRefSchema: z.ZodObject<{
    source: z.ZodString;
    account: z.ZodString;
    externalId: z.ZodString;
}, z.core.$strict>;
export type SourceRef = z.output<typeof sourceRefSchema>;
/** Parse a stored timestamp to epoch MICROSECONDS — the module's currency.
 *
 * The parse twin of `formatRfc3339Micros`, replacing the two rival readers
 * (`dataset/time.ts` and `graph/repo-common.ts`): it accepts the union of
 * their inputs and agrees with each to the microsecond
 * (`tst_bts_utils_time_parse`). Sub-microsecond digits truncate — this
 * module's precision is what the TEXT columns hold. */
export declare function parseRfc3339Micros(raw: string): number;
/** Every date in these schemas — one definition, reused, never z.string(). */
export declare const dateTimeSchema: z.ZodISODateTime;
/** What an AGENT row says about its own truth. A canonical row says nothing
 *  of the kind: it is a record, its provenance is the connector's stamp, and
 *  a record does not become false — a claim about the world does. */
export declare const agentStatementSchema: z.ZodObject<{
    origin: z.ZodLiteral<"agent">;
    confidence: z.ZodNumber;
    evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
}, z.core.$strict>;
export type AgentStatement = z.output<typeof agentStatementSchema>;
//# sourceMappingURL=statement.d.ts.map