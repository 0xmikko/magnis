import { z } from "zod";
import { SyncRevisionSchema } from "./entity.js";
import { TriggerCheckEventSchema } from "./event.js";
import { JsonValueSchema } from "./json.js";
import { DateTimeSchema } from "./statement.js";
export const SyncTargetSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("forward") }),
    z.strictObject({
        kind: z.literal("gap"),
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
    }),
    // @tested-by: tst_sdk_core_contract_011
    // @invariant: the public SDK accepts every durable backend SyncTarget variant.
    z.strictObject({
        kind: z.literal("seededInitialHistory"),
        params: JsonValueSchema,
    }),
    z.strictObject({ kind: z.literal("snapshot"), generation: z.string().min(1) }),
    z.strictObject({
        kind: z.literal("timeWindow"),
        from: z.string().min(1),
        to: z.string().min(1),
    }),
    z.strictObject({
        kind: z.literal("trackedIdentities"),
        identities: z.array(z.string().min(1)),
    }),
]);
export const ForwardCheckpointEffectSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("retain") }),
    z.strictObject({ kind: z.literal("replace"), value: JsonValueSchema }),
    z.strictObject({ kind: z.literal("clear") }),
]);
export const SyncProgressReceiptSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("continueTarget"), continuationToken: JsonValueSchema }),
    z.strictObject({
        kind: z.literal("completeTarget"),
        forwardCheckpoint: ForwardCheckpointEffectSchema,
    }),
]);
const estimatedAtSchema = z.union([DateTimeSchema, z.literal("unknown")]);
const countSchema = z.number().int().nonnegative();
/** Six stages the machine works in. The worker switches on `kind`; the screen prints it.
 * Where the machine is inside a stage — its cursor, its gaps, the pass — is the row, not
 * the status. `estimatedAt` is computed when reported; the row stores whatever was last
 * reported and never reads it back. */
export const SyncStageSchema = z.discriminatedUnion("kind", [
    // the first pass over the scopes, breadth first; the plan grows here
    z.strictObject({ kind: z.literal("bootstrap"), estimatedAt: estimatedAtSchema }),
    // the set is complete; the Graph is reconciled with the Source
    z.strictObject({ kind: z.literal("reconcile") }),
    // older history until no bounded gap is left
    z.strictObject({ kind: z.literal("backfill"), estimatedAt: estimatedAtSchema }),
    // forward from the checkpoint, since the listener was down or the last poll
    z.strictObject({ kind: z.literal("catchingUp") }),
    // history done; live items arrive (push)
    z.strictObject({ kind: z.literal("live") }),
    // history done; the next catch-up at nextAt (poll)
    z.strictObject({ kind: z.literal("polling"), nextAt: DateTimeSchema }),
]);
/** Three holds the machine waits in, on top of a stage. */
export const SyncHoldSchema = z.discriminatedUnion("kind", [
    // the Source is held (Telegram FLOOD_WAIT)
    z.strictObject({ kind: z.literal("rateLimited"), retryAt: DateTimeSchema }),
    // a failure — the Source's, the Graph's or the repository's; retried with backoff
    z.strictObject({ kind: z.literal("interrupted"), retryAt: DateTimeSchema, message: z.string() }),
    // the Source refused the credential; the account's lifecycle follows
    z.strictObject({ kind: z.literal("signInRequired") }),
]);
/** The sync progress of the canonical entities of one schema — the entities that
 * came from the Source (origin `canonical`). */
export const CanonicalEntityProgressSchema = z.strictObject({
    /** What the line prints, as the module declares it for the schema: "messages", "chats", "events". */
    name: z.string().min(1),
    /** Canonical entities of this schema stamped for this account in the Graph: one count when
     * the worker is built, then moved by every page's `inserted − removed`. Never estimated. */
    synced: countSchema,
    /** The estimation for this schema, or "unplanned" when the Source stated no count.
     * `total` is what the Source stated for the admitted scopes of this pass. Exact; grows
     * during bootstrap; a scope counts as one of its own schema even when excluded; skipped
     * items are not in it. `skipped` is what the module's policy left out (messages of
     * excluded chats). */
    estimation: z.union([z.literal("unplanned"), z.strictObject({ total: countSchema, skipped: countSchema })]),
});
/** The sync of one account on one Source surface, as its worker reports it.
 * A Google account has one per surface (mail, events, contacts); a Telegram account
 * has one. Null on the wire when the surface has no worker. */
export const AccountSyncStateSchema = z.strictObject({
    /** Whether the worker applied the user's latest sync choices: null when the surface
     * syncs no chosen entities. */
    syncApplication: z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("pending") }),
        z.strictObject({ kind: z.literal("applied") }),
        z.strictObject({ kind: z.literal("failed"), message: z.string() }),
    ]).nullable(),
    /** The sync revision of each applied choice, by the entity the choice names. */
    appliedSyncRevisions: z.record(z.string(), SyncRevisionSchema).readonly(),
    /** The one list: the stage the worker is in, or the hold on top of it, with the numbers
     * its line prints. */
    status: z.union([SyncStageSchema, SyncHoldSchema]),
    /** The progress of each entity schema the worker fills, by schema, in the module's
     * declared order. */
    progress: z.record(z.string(), CanonicalEntityProgressSchema),
});
/** One saved sync choice a syncable module reports: the entity, the provider
 * scope it names, the choice and its graph-owned revision. */
export const SyncChoiceSchema = z.strictObject({
    id: z.uuid(),
    scopeId: z.string().min(1),
    syncEnabled: z.boolean(),
    syncRevision: SyncRevisionSchema,
});
/** What the host asks a syncable module's `sync.selection` method for: one
 * connected account at one account generation. */
export const SyncSelectionRequestSchema = z.strictObject({
    sourceId: z.string(),
    accountId: z.string(),
    accountGeneration: z.int(),
});
/** What a syncable module's `sync.selection` method answers: every saved
 * choice of its surface. An entity, a provider scope and an X handle each
 * appear once. */
export const SyncSelectionSchema = z.discriminatedUnion("surface", [
    z.strictObject({ surface: z.literal("telegram"), choices: z.array(SyncChoiceSchema).readonly() }),
    z.strictObject({ surface: z.literal("email"), choices: z.array(SyncChoiceSchema).readonly(), unknownSenderEnabled: z.boolean() }),
    z.strictObject({ surface: z.literal("x"), choices: z.array(SyncChoiceSchema.extend({ handle: z.string().min(1) })).readonly() }),
]).superRefine((selection, context) => {
    const ids = new Set();
    const scopes = new Set();
    const handles = new Set();
    for (const choice of selection.choices) {
        if (ids.has(choice.id) || scopes.has(choice.scopeId)) {
            context.addIssue({ code: "custom", message: "sync selection contains duplicate entity or provider IDs" });
            return;
        }
        ids.add(choice.id);
        scopes.add(choice.scopeId);
        if ("handle" in choice) {
            const handle = choice.handle.toLowerCase();
            if (handles.has(handle)) {
                context.addIssue({ code: "custom", message: "sync selection contains duplicate handles" });
                return;
            }
            handles.add(handle);
        }
    }
});
/** A Source message as a plugin receives it: the host's envelope without its
 * account generation. */
export const SyncEnvelopeSchema = z.strictObject({
    sourceId: z.string(),
    surface: z.string(),
    accountId: z.string(),
    userId: z.string(),
    kind: z.enum(["snapshot", "live", "delete", "ack", "status", "error"]),
    identityKey: z.string().exactOptional(),
    remoteId: z.string().nullable().exactOptional(),
    cursor: JsonValueSchema.exactOptional(),
    /** Where the item sits in its scope. */
    position: z.strictObject({ scopeId: z.string(), id: z.int() }).exactOptional(),
    payload: JsonValueSchema,
    timestamp: z.string(),
});
/** What a plugin's sync handler receives. */
export const SyncHandlerParamsSchema = z.strictObject({
    envelopes: z.array(SyncEnvelopeSchema).readonly(),
    generation: z.string().exactOptional(),
    command: JsonValueSchema.exactOptional(),
});
/** What a plugin's sync hooks receive. The connection-ready hook sends no
 * generation; the sync-complete hook does. */
export const SyncHookParamsSchema = z.strictObject({
    userId: z.string(),
    sourceId: z.string(),
    accountId: z.string(),
    identityKey: z.string().nullable(),
    generation: z.string().exactOptional(),
});
/** One schema's counts in a module's plan statement, relative to its last
 * statement: negative at a departure. */
export const SyncPlanDeltaSchema = z.strictObject({
    total: z.int(),
    skipped: z.int(),
});
const syncPlanSchema = z.record(z.string(), SyncPlanDeltaSchema).readonly();
const scopeIdsSchema = z.array(z.string().min(1)).readonly();
/** What a module answers at the end of a pass: the scopes that left, and
 * what their statements gave back to the plan, per schema. */
export const SyncReconcileAnswerSchema = z.strictObject({
    departed: scopeIdsSchema,
    plan: syncPlanSchema,
});
const ingestBatchResultShape = {
    /** Remote ids that were not persisted and must not be marked covered. */
    droppedRemoteIds: z.array(z.string()).readonly(),
    /** Trigger checks whose publication is owned by the caller. */
    triggerChecks: z.array(TriggerCheckEventSchema).readonly(),
};
/** Outcome of ingesting a page of source envelopes. */
export const IngestBatchResultSchema = z.strictObject(ingestBatchResultShape);
/** What a page receiver answers: the ingest result, and — for a page it
 * states a plan for — each schema's count relative to its last statement
 * for the scopes on the page, and the scopes it excluded. A receiver that
 * states neither answers null and no scopes, as the host reads it today. */
export const SyncReceiptSchema = z.strictObject({
    ...ingestBatchResultShape,
    plan: syncPlanSchema.nullable().default(null),
    excluded: scopeIdsSchema.default([]),
});
