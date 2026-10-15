/** Source claims and model proposals; Graph, the indexer and workspace transfer decode the same contract. */
import { z } from "zod";
import { IndexingStatusSchema, PersistentEntitySchema } from "./entity.js";
import { IdSchema, PersistentEntityIdSchema } from "./id.js";
import { JsonValueSchema } from "./json.js";
import { LinkSchema } from "./link.js";
import { DateTimeSchema, parseRfc3339Micros } from "./statement.js";
/** @tested-by: tst_sdk_indexing_001, tst_sdk_indexing_003 */
export function validPeriod(period) {
    return period.validFrom === null || period.validUntil === null ||
        parseRfc3339Micros(period.validFrom) < parseRfc3339Micros(period.validUntil);
}
/** A source boundary the database stores exactly: more than six fraction
 *  digits would be truncated, so such a date is refused, never rounded.
 *  @tested-by: tst_sdk_indexing_003 */
const eventDateSchema = DateTimeSchema.refine((raw) => (/\.(\d+)/.exec(raw)?.[1]?.length ?? 0) <= 6, "event dates are stored at microsecond precision");
// The annotated arrow keeps this schema's type from depending on
// validPeriod's parameter, which is this schema's output.
export const CanonicalPeriodSchema = z.strictObject({
    validFrom: DateTimeSchema.nullable(),
    validUntil: DateTimeSchema.nullable(),
}).refine((period) => validPeriod(period), "validUntil must follow validFrom");
export const GraphValiditySchema = z.strictObject({
    at: DateTimeSchema.nullable(),
});
// Wire query; the host supplies owner and all-period canonical-only semantics.
export const IndexingContextSchema = z.strictObject({
    startEntityIds: z.array(PersistentEntityIdSchema).min(1),
    maxDepth: z.int().min(0).max(8),
    maxNodes: z.int().min(1).max(1000),
    maxEdges: z.int().min(0).max(5000),
    direction: z.enum(["out", "in", "both"]),
    linkKinds: z.array(z.string().min(1)).nullable(),
});
/** What the model is shown: the source, its context rows and their rendered text. */
export const IndexingInputSchema = z.strictObject({
    entity: PersistentEntityIdSchema,
    context: IndexingContextSchema,
    entities: z.array(PersistentEntitySchema.refine((row) => row.origin === "canonical")),
    links: z.array(LinkSchema.refine((row) => row.origin === "canonical")),
    text: z.record(PersistentEntityIdSchema, z.string()),
}).superRefine((input, ctx) => {
    // @tested-by: tst_sdk_indexing_001
    const source = input.entities.find((entity) => entity.id === input.entity);
    const ids = new Set(input.entities.map((entity) => entity.id));
    const linkIds = new Set(input.links.map((link) => link.id));
    if (source === undefined || ids.size !== input.entities.length || linkIds.size !== input.links.length ||
        // Access is established by the host's owner-scoped traversal before parsing.
        input.links.some((link) => !ids.has(link.from) || !ids.has(link.to) || !validPeriod(link)) ||
        input.context.startEntityIds.some((id) => !ids.has(id)) ||
        ids.size !== Object.keys(input.text).length || [...ids].some((id) => !Object.hasOwn(input.text, id))) {
        ctx.addIssue({ code: "custom", message: "context requires one canonical source, unique complete rows and their text" });
    }
});
// Call A output: facts of the source and their exact passages in its own text.
export const IndexingReadSchema = z.strictObject({
    facts: z.array(z.strictObject({
        text: z.string().min(1),
        effect: z.enum(["assert", "end", "correct"]),
        statementKind: z.enum(["states", "reports", "asks", "offers", "hypothetical"]),
        quote: z.string().min(1),
    })),
});
// Reuse the proposed-ref vocabulary of the earlier interface discussion.
export const RefSchema = z.union([
    z.strictObject({ id: PersistentEntityIdSchema }),
    z.strictObject({ proposed: z.int().nonnegative() }),
]);
export const ProposedEntitySchema = z.strictObject({
    existing: PersistentEntityIdSchema.nullable(),
    schemaId: z.string().min(1),
    schemaVersion: z.int().positive(),
    name: z.string().min(1),
    keys: z.array(z.string().min(1)),
    properties: JsonValueSchema,
    confidence: z.number().gt(0).lt(1),
    validFrom: eventDateSchema.nullable(),
    validUntil: eventDateSchema.nullable(),
    fact: z.int().nonnegative(),
}).refine(validPeriod, "validUntil must follow validFrom");
export const ProposedLinkSchema = z.strictObject({
    from: RefSchema,
    to: RefSchema,
    kind: z.string().min(1),
    confidence: z.number().gt(0).lt(1),
    validFrom: eventDateSchema.nullable(),
    validUntil: eventDateSchema.nullable(),
    fact: z.int().nonnegative(),
}).refine(validPeriod, "validUntil must follow validFrom");
/** An ending names its relation and the source-stated dates, never a link row:
 *  it may arrive before the period it ends. A null validFrom selects any start;
 *  a null validUntil is an ending whose date the source does not give. */
export const ChangeSchema = z.strictObject({
    from: RefSchema,
    to: RefSchema,
    kind: z.string().min(1),
    confidence: z.number().gt(0).lt(1),
    validFrom: eventDateSchema.nullable(),
    validUntil: eventDateSchema.nullable(),
    fact: z.int().nonnegative(),
}).refine(validPeriod, "validUntil must follow validFrom");
// Call B output. Fact indices refer to the accepted Call A output.
export const IndexingProposalSchema = z.strictObject({
    entities: z.array(ProposedEntitySchema),
    links: z.array(ProposedLinkSchema),
    changes: z.array(ChangeSchema),
});
/** The values one source claims for one derived entity, resolved to its row ID. */
export const ClaimedEntitySchema = z.strictObject({
    id: PersistentEntityIdSchema,
    schemaId: z.string().min(1),
    schemaVersion: z.int().positive(),
    name: z.string().nullable(),
    keys: z.array(z.string().min(1)),
    properties: JsonValueSchema,
    validFrom: eventDateSchema.nullable(),
    validUntil: eventDateSchema.nullable(),
}).refine(validPeriod, "validUntil must follow validFrom");
/** A relation one source claims or ends, resolved to endpoint IDs. For a link
 *  claim the dates are its period; for an ending claim validFrom selects the
 *  period and validUntil is the end. */
export const ClaimedLinkSchema = z.strictObject({
    from: PersistentEntityIdSchema,
    to: PersistentEntityIdSchema,
    kind: z.string().min(1),
    validFrom: eventDateSchema.nullable(),
    validUntil: eventDateSchema.nullable(),
}).refine(validPeriod, "validUntil must follow validFrom");
const graphClaimBaseShape = {
    id: IdSchema,
    owner: IdSchema,
    sourceId: PersistentEntityIdSchema,
    origin: z.enum(["indexed", "manual"]),
    statementKind: z.enum(["states", "reports"]).nullable(),
    mention: z.union([ProposedEntitySchema, ProposedLinkSchema, ChangeSchema]).nullable(),
    quote: z.string().min(1).nullable(),
    /** 0 < c <= 1; exactly 1 is the owner's approval. */
    confidence: z.number().gt(0).lte(1),
    state: z.enum(["active", "inactive", "replaced"]),
    reason: z.string().min(1).nullable(),
    createdAt: DateTimeSchema,
};
/** What one canonical source said about one entity, link or ending. Derived rows
 *  are derived from active claims; a source change retires only its own claims. */
export const GraphClaimSchema = z.discriminatedUnion("kind", [
    z.strictObject({ ...graphClaimBaseShape, kind: z.literal("entity"), statement: ClaimedEntitySchema }),
    z.strictObject({ ...graphClaimBaseShape, kind: z.literal("link"), statement: ClaimedLinkSchema }),
    z.strictObject({ ...graphClaimBaseShape, kind: z.literal("ending"), statement: ClaimedLinkSchema }),
]).superRefine((claim, ctx) => {
    // @tested-by: tst_sdk_indexing_002
    const manual = claim.mention === null && claim.quote === null && claim.statementKind === null;
    const indexed = claim.mention !== null && claim.quote !== null && claim.statementKind !== null && claim.confidence < 1;
    if (claim.origin === "manual" ? !manual : !indexed) {
        ctx.addIssue({ code: "custom", message: "an indexed claim quotes its mention and statement kind below confidence 1; a manual claim has none of them" });
    }
    if ((claim.state === "active") !== (claim.reason === null)) {
        ctx.addIssue({ code: "custom", message: "only an active claim has no reason" });
    }
});
/** The indexing status of one canonical source. */
export const GraphIndexEntrySchema = z.strictObject({
    owner: IdSchema,
    entityId: PersistentEntityIdSchema,
    status: IndexingStatusSchema,
    reason: z.string().min(1).nullable(),
    modelName: z.string().min(1),
    promptVersion: z.string().min(1),
    indexedAt: DateTimeSchema,
}).refine((entry) => entry.status !== "refused" || entry.reason !== null, "a refusal carries its reason");
// Stored under Event.metadata.graphDecision on the removal event. Derivation
// reads the identity: a withdrawn entity or link period is never materialized again.
export const GraphDecisionSchema = z.strictObject({
    owner: IdSchema,
    action: z.literal("withdraw"),
    kind: z.enum(["entity", "link"]),
    identity: z.string().min(1),
    evidence: z.array(PersistentEntityIdSchema).min(1),
}).refine((d) => d.identity.startsWith(`["${d.kind}",`), "decision kind must match its identity");
// Stored on the existing entities_merged event. collapsed_edges currently
// contains only winner snapshots and is insufficient as an ID mapping.
export const GraphMergeSchema = z.strictObject({
    owner: IdSchema,
    entities: z.record(PersistentEntityIdSchema, PersistentEntityIdSchema),
    links: z.record(IdSchema, IdSchema),
});
