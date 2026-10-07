/** Shared Entity and Link provenance: canonical records and derived statements
 * supported by evidence, confidence and temporal validity.
 *
 * @tested-by: tst_bts_core_link_010
 */
import { z } from "zod";
import { PersistentEntityIdSchema } from "./id.js";
/** The connector's stamp: WHICH connector, on WHICH account, and the source
 *  system's own id. `account` is present on every stamped row, so it is
 *  required: a canonical row is always a sync write. `externalId` is the
 *  idempotency key — a re-sync lands on the same entity through it. A derived
 *  row has evidence instead of a source stamp. A canonical link carries no
 *  stamp of its own; its provenance IS
 *  its `from` entity's `source`. */
export const SourceRefSchema = z.strictObject({
    source: z.string(),
    account: z.string(),
    externalId: z.string(),
});
/** Every textual form both retiring parsers accepted, in one grammar:
 * RFC3339 (`T` or space, `Z` or `±HH:MM`, 1-9 fraction digits, seconds
 * optional as ISO minute precision) plus the
 * driver text forms (`+00` / `±HHMM` short offsets, no-offset naive
 * timestamps read as UTC). */
const PARSE_RE = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:([Zz])|([+-])(\d{2})(?::?(\d{2}))?)?$/;
/** Parse a stored timestamp to epoch MICROSECONDS — the module's currency.
 *
 * The parse twin of `formatRfc3339Micros`, replacing the two rival readers
 * (`dataset/time.ts` and `graph/repo-common.ts`): it accepts the union of
 * their inputs and agrees with each to the microsecond
 * (`tst_bts_utils_time_parse`). Sub-microsecond digits truncate — this
 * module's precision is what the TEXT columns hold. */
export function parseRfc3339Micros(raw) {
    const match = PARSE_RE.exec(raw);
    if (match === null) {
        throw new Error(`invalid RFC3339 timestamp: ${JSON.stringify(raw)}`);
    }
    const [, y, mo, d, h, mi, sec, frac, , sign, oh, om] = match;
    if (y === undefined || mo === undefined || d === undefined || h === undefined || mi === undefined) {
        throw new Error(`invalid RFC3339 timestamp: ${JSON.stringify(raw)}`);
    }
    // ISO minute precision, which the SDK's date schema admits, denotes zero seconds.
    const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec ?? 0));
    if (!Number.isFinite(ms)) {
        throw new Error(`invalid RFC3339 timestamp: ${JSON.stringify(raw)}`);
    }
    const micros = frac === undefined ? 0 : Number(frac.padEnd(6, "0").slice(0, 6));
    // No suffix is the naive driver fallback, read as UTC — `Z` and a zero
    // offset land on the same zero.
    const offsetSeconds = sign === undefined || oh === undefined
        ? 0
        : (sign === "-" ? -1 : 1) * (Number(oh) * 3600 + Number(om ?? "0") * 60);
    return ms * 1000 + micros - offsetSeconds * 1_000_000;
}
/** Every date in these schemas — one definition, reused, never z.string(). */
export const DateTimeSchema = z.iso.datetime({ offset: true });
/** What a derived row says about its own truth. A canonical row says nothing
 *  of the kind: it is a record, its provenance is the connector's stamp, and
 *  a record does not become false — a claim about the world does. */
export const DerivedStatementSchema = z.strictObject({
    origin: z.literal("derived"),
    /** 0 < c <= 1. Exactly 1 means a person approved it. */
    confidence: z.number().gt(0).lte(1),
    /** Never empty: what it was read from, plus any approval episode. zod 4
     * infers `.nonempty()` as string[]; the tuple form's output is
     * `[PersistentEntityId, ...PersistentEntityId[]]`. */
    evidence: z.tuple([PersistentEntityIdSchema], PersistentEntityIdSchema),
    /** When the claim became true; null = for as long as we have known it. */
    validFrom: DateTimeSchema.nullable(),
    /** When it stopped; null = still true. Set, never deleted. */
    validUntil: DateTimeSchema.nullable(),
});
