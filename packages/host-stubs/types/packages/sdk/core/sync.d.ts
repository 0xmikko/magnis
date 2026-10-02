import { z } from "zod";
export declare const SyncTargetSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"forward">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"gap">;
    start: z.ZodNumber;
    end: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"seededInitialHistory">;
    params: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"snapshot">;
    generation: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"timeWindow">;
    from: z.ZodString;
    to: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"trackedIdentities">;
    identities: z.ZodArray<z.ZodString>;
}, z.core.$strict>], "kind">;
export type SyncTarget = z.output<typeof SyncTargetSchema>;
export declare const ForwardCheckpointEffectSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"retain">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"replace">;
    value: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"clear">;
}, z.core.$strict>], "kind">;
export type ForwardCheckpointEffect = z.output<typeof ForwardCheckpointEffectSchema>;
export declare const SyncProgressReceiptSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"continueTarget">;
    continuationToken: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"completeTarget">;
    forwardCheckpoint: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"retain">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"replace">;
        value: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"clear">;
    }, z.core.$strict>], "kind">;
}, z.core.$strict>], "kind">;
export type SyncProgressReceipt = z.output<typeof SyncProgressReceiptSchema>;
/** Six stages the machine works in. The worker switches on `kind`; the screen prints it.
 * Where the machine is inside a stage — its cursor, its gaps, the pass — is the row, not
 * the status. `estimatedAt` is computed when reported; the row stores whatever was last
 * reported and never reads it back. */
export declare const SyncStageSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"bootstrap">;
    estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"reconcile">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"backfill">;
    estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"catchingUp">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"live">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"polling">;
    nextAt: z.ZodISODateTime;
}, z.core.$strict>], "kind">;
export type SyncStage = z.output<typeof SyncStageSchema>;
/** Three holds the machine waits in, on top of a stage. */
export declare const SyncHoldSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"rateLimited">;
    retryAt: z.ZodISODateTime;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"interrupted">;
    retryAt: z.ZodISODateTime;
    message: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"signInRequired">;
}, z.core.$strict>], "kind">;
export type SyncHold = z.output<typeof SyncHoldSchema>;
/** The sync progress of the canonical entities of one schema — the entities that
 * came from the Source (origin `canonical`). */
export declare const CanonicalEntityProgressSchema: z.ZodObject<{
    name: z.ZodString;
    synced: z.ZodNumber;
    estimation: z.ZodUnion<readonly [z.ZodLiteral<"unplanned">, z.ZodObject<{
        total: z.ZodNumber;
        skipped: z.ZodNumber;
    }, z.core.$strict>]>;
}, z.core.$strict>;
export type CanonicalEntityProgress = z.output<typeof CanonicalEntityProgressSchema>;
/** The sync of one account on one Source surface, as its worker reports it.
 * A Google account has one per surface (mail, events, contacts); a Telegram account
 * has one. Null on the wire when the surface has no worker. */
export declare const AccountSyncStateSchema: z.ZodObject<{
    status: z.ZodUnion<readonly [z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"bootstrap">;
        estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"reconcile">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"backfill">;
        estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"catchingUp">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"live">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"polling">;
        nextAt: z.ZodISODateTime;
    }, z.core.$strict>], "kind">, z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"rateLimited">;
        retryAt: z.ZodISODateTime;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"interrupted">;
        retryAt: z.ZodISODateTime;
        message: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"signInRequired">;
    }, z.core.$strict>], "kind">]>;
    progress: z.ZodRecord<z.ZodString, z.ZodObject<{
        name: z.ZodString;
        synced: z.ZodNumber;
        estimation: z.ZodUnion<readonly [z.ZodLiteral<"unplanned">, z.ZodObject<{
            total: z.ZodNumber;
            skipped: z.ZodNumber;
        }, z.core.$strict>]>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type AccountSyncState = z.output<typeof AccountSyncStateSchema>;
/** A Source message as a plugin receives it: the host's envelope without its
 * account generation. */
export declare const SyncEnvelopeSchema: z.ZodObject<{
    sourceId: z.ZodString;
    surface: z.ZodString;
    accountId: z.ZodString;
    userId: z.ZodString;
    kind: z.ZodEnum<{
        error: "error";
        status: "status";
        live: "live";
        snapshot: "snapshot";
        delete: "delete";
        ack: "ack";
    }>;
    identityKey: z.ZodExactOptional<z.ZodString>;
    remoteId: z.ZodExactOptional<z.ZodNullable<z.ZodString>>;
    cursor: z.ZodExactOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    position: z.ZodExactOptional<z.ZodObject<{
        scopeId: z.ZodString;
        id: z.ZodInt;
    }, z.core.$strict>>;
    payload: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    timestamp: z.ZodString;
}, z.core.$strict>;
export type SyncEnvelope = z.output<typeof SyncEnvelopeSchema>;
/** What a plugin's sync handler receives. */
export declare const SyncHandlerParamsSchema: z.ZodObject<{
    envelopes: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        surface: z.ZodString;
        accountId: z.ZodString;
        userId: z.ZodString;
        kind: z.ZodEnum<{
            error: "error";
            status: "status";
            live: "live";
            snapshot: "snapshot";
            delete: "delete";
            ack: "ack";
        }>;
        identityKey: z.ZodExactOptional<z.ZodString>;
        remoteId: z.ZodExactOptional<z.ZodNullable<z.ZodString>>;
        cursor: z.ZodExactOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
        position: z.ZodExactOptional<z.ZodObject<{
            scopeId: z.ZodString;
            id: z.ZodInt;
        }, z.core.$strict>>;
        payload: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        timestamp: z.ZodString;
    }, z.core.$strict>>>;
    generation: z.ZodExactOptional<z.ZodString>;
    command: z.ZodExactOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
}, z.core.$strict>;
export type SyncHandlerParams = z.output<typeof SyncHandlerParamsSchema>;
/** What a plugin's sync hooks receive. The connection-ready hook sends no
 * generation; the sync-complete hook does. */
export declare const SyncHookParamsSchema: z.ZodObject<{
    userId: z.ZodString;
    sourceId: z.ZodString;
    accountId: z.ZodString;
    identityKey: z.ZodNullable<z.ZodString>;
    generation: z.ZodExactOptional<z.ZodString>;
}, z.core.$strict>;
export type SyncHookParams = z.output<typeof SyncHookParamsSchema>;
/** One schema's counts in a module's plan statement, relative to its last
 * statement: negative at a departure. */
export declare const SyncPlanDeltaSchema: z.ZodObject<{
    total: z.ZodInt;
    skipped: z.ZodInt;
}, z.core.$strict>;
export type SyncPlanDelta = z.output<typeof SyncPlanDeltaSchema>;
/** What a module answers at the end of a pass: the scopes that left, and
 * what their statements gave back to the plan, per schema. */
export declare const SyncReconcileAnswerSchema: z.ZodObject<{
    departed: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    plan: z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodObject<{
        total: z.ZodInt;
        skipped: z.ZodInt;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type SyncReconcileAnswer = z.output<typeof SyncReconcileAnswerSchema>;
/** Outcome of ingesting a page of source envelopes. */
export declare const IngestBatchResultSchema: z.ZodObject<{
    droppedRemoteIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    triggerChecks: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        type: z.ZodLiteral<"trigger.check">;
        eventKind: z.ZodString;
        schemaId: z.ZodString;
        entityId: z.ZodString;
        phase: z.ZodEnum<{
            live: "live";
            bootstrap: "bootstrap";
            catchup: "catchup";
        }>;
        touchedEntityIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        context: z.ZodDefault<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
        userId: z.ZodString;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type IngestBatchResult = z.output<typeof IngestBatchResultSchema>;
/** What a page receiver answers: the ingest result, and — for a page it
 * states a plan for — each schema's count relative to its last statement
 * for the scopes on the page, and the scopes it excluded. A receiver that
 * states neither answers null and no scopes, as the host reads it today. */
export declare const SyncReceiptSchema: z.ZodObject<{
    plan: z.ZodDefault<z.ZodNullable<z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodObject<{
        total: z.ZodInt;
        skipped: z.ZodInt;
    }, z.core.$strict>>>>>;
    excluded: z.ZodDefault<z.ZodReadonly<z.ZodArray<z.ZodString>>>;
    droppedRemoteIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    triggerChecks: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        type: z.ZodLiteral<"trigger.check">;
        eventKind: z.ZodString;
        schemaId: z.ZodString;
        entityId: z.ZodString;
        phase: z.ZodEnum<{
            live: "live";
            bootstrap: "bootstrap";
            catchup: "catchup";
        }>;
        touchedEntityIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        context: z.ZodDefault<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
        userId: z.ZodString;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type SyncReceipt = z.output<typeof SyncReceiptSchema>;
//# sourceMappingURL=sync.d.ts.map