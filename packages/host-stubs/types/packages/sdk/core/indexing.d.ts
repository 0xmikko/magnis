/** Source claims and model proposals; Graph, the indexer and workspace transfer decode the same contract. */
import { z } from "zod";
/** @tested-by: tst_sdk_indexing_001, tst_sdk_indexing_003 */
export declare function validPeriod(period: CanonicalPeriod): boolean;
export declare const CanonicalPeriodSchema: z.ZodObject<{
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
}, z.core.$strict>;
export type CanonicalPeriod = z.output<typeof CanonicalPeriodSchema>;
export declare const GraphValiditySchema: z.ZodObject<{
    at: z.ZodNullable<z.ZodISODateTime>;
}, z.core.$strict>;
export type GraphValidity = z.output<typeof GraphValiditySchema>;
export declare const IndexingContextSchema: z.ZodObject<{
    startEntityIds: z.ZodArray<z.ZodString>;
    maxDepth: z.ZodInt;
    maxNodes: z.ZodInt;
    maxEdges: z.ZodInt;
    direction: z.ZodEnum<{
        in: "in";
        out: "out";
        both: "both";
    }>;
    linkKinds: z.ZodNullable<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export type IndexingContext = z.output<typeof IndexingContextSchema>;
/** What the model is shown: the source, its context rows and their rendered text. */
export declare const IndexingInputSchema: z.ZodObject<{
    entity: z.ZodString;
    context: z.ZodObject<{
        startEntityIds: z.ZodArray<z.ZodString>;
        maxDepth: z.ZodInt;
        maxNodes: z.ZodInt;
        maxEdges: z.ZodInt;
        direction: z.ZodEnum<{
            in: "in";
            out: "out";
            both: "both";
        }>;
        linkKinds: z.ZodNullable<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>;
    entities: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        source: z.ZodObject<{
            source: z.ZodString;
            account: z.ZodString;
            externalId: z.ZodString;
        }, z.core.$strict>;
        canonicalKey: z.ZodNullable<z.ZodString>;
        id: z.ZodString;
        owner: z.ZodString;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        indexed: z.ZodBoolean;
        syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
        syncRevision: z.ZodExactOptional<z.ZodString>;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        isPinned: z.ZodNullable<z.ZodBoolean>;
        pinOrder: z.ZodNullable<z.ZodNumber>;
        isArchived: z.ZodNullable<z.ZodBoolean>;
        properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    }, z.core.$strict>, z.ZodObject<{
        keys: z.ZodArray<z.ZodString>;
        origin: z.ZodLiteral<"agent">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        indexed: z.ZodBoolean;
        syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
        syncRevision: z.ZodExactOptional<z.ZodString>;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        isPinned: z.ZodNullable<z.ZodBoolean>;
        pinOrder: z.ZodNullable<z.ZodNumber>;
        isArchived: z.ZodNullable<z.ZodBoolean>;
        properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    }, z.core.$strict>], "origin"> & z.ZodType<{
        origin: "canonical";
        source: {
            source: string;
            account: string;
            externalId: string;
        };
        canonicalKey: string | null;
        id: string;
        owner: string;
        schemaId: string;
        schemaVersion: number;
        createdAt: string;
        name: string | null;
        indexed: boolean;
        date: string;
        idx: string | null;
        isPinned: boolean | null;
        pinOrder: number | null;
        isArchived: boolean | null;
        properties: import("./json.js").JsonValue;
        syncEnabled?: boolean;
        syncRevision?: string;
    }, {
        origin: "canonical";
        source: {
            source: string;
            account: string;
            externalId: string;
        };
        canonicalKey: string | null;
        id: string;
        owner: string;
        schemaId: string;
        schemaVersion: number;
        createdAt: string;
        name: string | null;
        indexed: boolean;
        date: string;
        idx: string | null;
        isPinned: boolean | null;
        pinOrder: number | null;
        isArchived: boolean | null;
        properties: unknown;
        syncEnabled?: boolean;
        syncRevision?: string;
    } | {
        keys: string[];
        origin: "agent";
        confidence: number;
        evidence: [string, ...string[]];
        validFrom: string | null;
        validUntil: string | null;
        id: string;
        owner: string;
        schemaId: string;
        schemaVersion: number;
        createdAt: string;
        name: string | null;
        indexed: boolean;
        date: string;
        idx: string | null;
        isPinned: boolean | null;
        pinOrder: number | null;
        isArchived: boolean | null;
        properties: unknown;
        syncEnabled?: boolean;
        syncRevision?: string;
    }, z.core.$ZodTypeInternals<{
        origin: "canonical";
        source: {
            source: string;
            account: string;
            externalId: string;
        };
        canonicalKey: string | null;
        id: string;
        owner: string;
        schemaId: string;
        schemaVersion: number;
        createdAt: string;
        name: string | null;
        indexed: boolean;
        date: string;
        idx: string | null;
        isPinned: boolean | null;
        pinOrder: number | null;
        isArchived: boolean | null;
        properties: import("./json.js").JsonValue;
        syncEnabled?: boolean;
        syncRevision?: string;
    }, {
        origin: "canonical";
        source: {
            source: string;
            account: string;
            externalId: string;
        };
        canonicalKey: string | null;
        id: string;
        owner: string;
        schemaId: string;
        schemaVersion: number;
        createdAt: string;
        name: string | null;
        indexed: boolean;
        date: string;
        idx: string | null;
        isPinned: boolean | null;
        pinOrder: number | null;
        isArchived: boolean | null;
        properties: unknown;
        syncEnabled?: boolean;
        syncRevision?: string;
    } | {
        keys: string[];
        origin: "agent";
        confidence: number;
        evidence: [string, ...string[]];
        validFrom: string | null;
        validUntil: string | null;
        id: string;
        owner: string;
        schemaId: string;
        schemaVersion: number;
        createdAt: string;
        name: string | null;
        indexed: boolean;
        date: string;
        idx: string | null;
        isPinned: boolean | null;
        pinOrder: number | null;
        isArchived: boolean | null;
        properties: unknown;
        syncEnabled?: boolean;
        syncRevision?: string;
    }>>>;
    links: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        metadata: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>, z.ZodObject<{
        origin: z.ZodLiteral<"agent">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>], "origin"> & z.ZodType<{
        origin: "canonical";
        metadata: import("./json.js").JsonValue;
        validFrom: string | null;
        validUntil: string | null;
        id: string;
        owner: string;
        from: string;
        to: string;
        kind: string;
        createdAt: string;
    }, {
        origin: "canonical";
        metadata: unknown;
        validFrom: string | null;
        validUntil: string | null;
        id: string;
        owner: string;
        from: string;
        to: string;
        kind: string;
        createdAt: string;
    } | {
        origin: "agent";
        confidence: number;
        evidence: [string, ...string[]];
        validFrom: string | null;
        validUntil: string | null;
        id: string;
        owner: string;
        from: string;
        to: string;
        kind: string;
        createdAt: string;
    }, z.core.$ZodTypeInternals<{
        origin: "canonical";
        metadata: import("./json.js").JsonValue;
        validFrom: string | null;
        validUntil: string | null;
        id: string;
        owner: string;
        from: string;
        to: string;
        kind: string;
        createdAt: string;
    }, {
        origin: "canonical";
        metadata: unknown;
        validFrom: string | null;
        validUntil: string | null;
        id: string;
        owner: string;
        from: string;
        to: string;
        kind: string;
        createdAt: string;
    } | {
        origin: "agent";
        confidence: number;
        evidence: [string, ...string[]];
        validFrom: string | null;
        validUntil: string | null;
        id: string;
        owner: string;
        from: string;
        to: string;
        kind: string;
        createdAt: string;
    }>>>;
    text: z.ZodRecord<z.ZodString, z.ZodString>;
}, z.core.$strict>;
export type IndexingInput = z.output<typeof IndexingInputSchema>;
/** Whether the author states a fact or merely asks, offers or imagines it. */
export type StatementKind = "states" | "reports" | "asks" | "offers" | "hypothetical";
export declare const IndexingReadSchema: z.ZodObject<{
    facts: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        effect: z.ZodEnum<{
            assert: "assert";
            end: "end";
            correct: "correct";
        }>;
        statementKind: z.ZodEnum<{
            states: "states";
            reports: "reports";
            asks: "asks";
            offers: "offers";
            hypothetical: "hypothetical";
        }>;
        quote: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type IndexingRead = z.output<typeof IndexingReadSchema>;
export declare const RefSchema: z.ZodUnion<readonly [z.ZodObject<{
    id: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    proposed: z.ZodInt;
}, z.core.$strict>]>;
export type Ref = z.output<typeof RefSchema>;
export declare const ProposedEntitySchema: z.ZodObject<{
    existing: z.ZodNullable<z.ZodString>;
    schemaId: z.ZodString;
    schemaVersion: z.ZodInt;
    name: z.ZodString;
    keys: z.ZodArray<z.ZodString>;
    properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    confidence: z.ZodNumber;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
    fact: z.ZodInt;
}, z.core.$strict>;
export type ProposedEntity = z.output<typeof ProposedEntitySchema>;
export declare const ProposedLinkSchema: z.ZodObject<{
    from: z.ZodUnion<readonly [z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        proposed: z.ZodInt;
    }, z.core.$strict>]>;
    to: z.ZodUnion<readonly [z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        proposed: z.ZodInt;
    }, z.core.$strict>]>;
    kind: z.ZodString;
    confidence: z.ZodNumber;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
    fact: z.ZodInt;
}, z.core.$strict>;
export type ProposedLink = z.output<typeof ProposedLinkSchema>;
/** An ending names its relation and the source-stated dates, never a link row:
 *  it may arrive before the period it ends. A null validFrom selects any start;
 *  a null validUntil is an ending whose date the source does not give. */
export declare const ChangeSchema: z.ZodObject<{
    from: z.ZodUnion<readonly [z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        proposed: z.ZodInt;
    }, z.core.$strict>]>;
    to: z.ZodUnion<readonly [z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        proposed: z.ZodInt;
    }, z.core.$strict>]>;
    kind: z.ZodString;
    confidence: z.ZodNumber;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
    fact: z.ZodInt;
}, z.core.$strict>;
export type Change = z.output<typeof ChangeSchema>;
export declare const IndexingProposalSchema: z.ZodObject<{
    entities: z.ZodArray<z.ZodObject<{
        existing: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        name: z.ZodString;
        keys: z.ZodArray<z.ZodString>;
        properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        confidence: z.ZodNumber;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        fact: z.ZodInt;
    }, z.core.$strict>>;
    links: z.ZodArray<z.ZodObject<{
        from: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        to: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        kind: z.ZodString;
        confidence: z.ZodNumber;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        fact: z.ZodInt;
    }, z.core.$strict>>;
    changes: z.ZodArray<z.ZodObject<{
        from: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        to: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        kind: z.ZodString;
        confidence: z.ZodNumber;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        fact: z.ZodInt;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type IndexingProposal = z.output<typeof IndexingProposalSchema>;
/** The values one source claims for one agent entity, resolved to its row ID. */
export declare const ClaimedEntitySchema: z.ZodObject<{
    id: z.ZodString;
    schemaId: z.ZodString;
    schemaVersion: z.ZodInt;
    name: z.ZodNullable<z.ZodString>;
    keys: z.ZodArray<z.ZodString>;
    properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
}, z.core.$strict>;
export type ClaimedEntity = z.output<typeof ClaimedEntitySchema>;
/** A relation one source claims or ends, resolved to endpoint IDs. For a link
 *  claim the dates are its period; for an ending claim validFrom selects the
 *  period and validUntil is the end. */
export declare const ClaimedLinkSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    kind: z.ZodString;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
}, z.core.$strict>;
export type ClaimedLink = z.output<typeof ClaimedLinkSchema>;
/** What one canonical source said about one entity, link or ending. Agent rows
 *  are derived from active claims; a source change retires only its own claims. */
export declare const GraphClaimSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"entity">;
    statement: z.ZodObject<{
        id: z.ZodString;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        name: z.ZodNullable<z.ZodString>;
        keys: z.ZodArray<z.ZodString>;
        properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
    }, z.core.$strict>;
    id: z.ZodString;
    owner: z.ZodString;
    sourceId: z.ZodString;
    origin: z.ZodEnum<{
        indexed: "indexed";
        manual: "manual";
    }>;
    statementKind: z.ZodNullable<z.ZodEnum<{
        states: "states";
        reports: "reports";
    }>>;
    mention: z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
        existing: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        name: z.ZodString;
        keys: z.ZodArray<z.ZodString>;
        properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        confidence: z.ZodNumber;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        fact: z.ZodInt;
    }, z.core.$strict>, z.ZodObject<{
        from: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        to: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        kind: z.ZodString;
        confidence: z.ZodNumber;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        fact: z.ZodInt;
    }, z.core.$strict>, z.ZodObject<{
        from: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        to: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        kind: z.ZodString;
        confidence: z.ZodNumber;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        fact: z.ZodInt;
    }, z.core.$strict>]>>;
    quote: z.ZodNullable<z.ZodString>;
    confidence: z.ZodNumber;
    state: z.ZodEnum<{
        active: "active";
        inactive: "inactive";
        replaced: "replaced";
    }>;
    reason: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodISODateTime;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"link">;
    statement: z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodString;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
    }, z.core.$strict>;
    id: z.ZodString;
    owner: z.ZodString;
    sourceId: z.ZodString;
    origin: z.ZodEnum<{
        indexed: "indexed";
        manual: "manual";
    }>;
    statementKind: z.ZodNullable<z.ZodEnum<{
        states: "states";
        reports: "reports";
    }>>;
    mention: z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
        existing: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        name: z.ZodString;
        keys: z.ZodArray<z.ZodString>;
        properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        confidence: z.ZodNumber;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        fact: z.ZodInt;
    }, z.core.$strict>, z.ZodObject<{
        from: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        to: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        kind: z.ZodString;
        confidence: z.ZodNumber;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        fact: z.ZodInt;
    }, z.core.$strict>, z.ZodObject<{
        from: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        to: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        kind: z.ZodString;
        confidence: z.ZodNumber;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        fact: z.ZodInt;
    }, z.core.$strict>]>>;
    quote: z.ZodNullable<z.ZodString>;
    confidence: z.ZodNumber;
    state: z.ZodEnum<{
        active: "active";
        inactive: "inactive";
        replaced: "replaced";
    }>;
    reason: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodISODateTime;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"ending">;
    statement: z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodString;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
    }, z.core.$strict>;
    id: z.ZodString;
    owner: z.ZodString;
    sourceId: z.ZodString;
    origin: z.ZodEnum<{
        indexed: "indexed";
        manual: "manual";
    }>;
    statementKind: z.ZodNullable<z.ZodEnum<{
        states: "states";
        reports: "reports";
    }>>;
    mention: z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
        existing: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        name: z.ZodString;
        keys: z.ZodArray<z.ZodString>;
        properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        confidence: z.ZodNumber;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        fact: z.ZodInt;
    }, z.core.$strict>, z.ZodObject<{
        from: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        to: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        kind: z.ZodString;
        confidence: z.ZodNumber;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        fact: z.ZodInt;
    }, z.core.$strict>, z.ZodObject<{
        from: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        to: z.ZodUnion<readonly [z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            proposed: z.ZodInt;
        }, z.core.$strict>]>;
        kind: z.ZodString;
        confidence: z.ZodNumber;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        fact: z.ZodInt;
    }, z.core.$strict>]>>;
    quote: z.ZodNullable<z.ZodString>;
    confidence: z.ZodNumber;
    state: z.ZodEnum<{
        active: "active";
        inactive: "inactive";
        replaced: "replaced";
    }>;
    reason: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodISODateTime;
}, z.core.$strict>], "kind">;
export type GraphClaim = z.output<typeof GraphClaimSchema>;
/** The indexing status of one canonical source. */
export declare const GraphIndexEntrySchema: z.ZodObject<{
    owner: z.ZodString;
    entityId: z.ZodString;
    status: z.ZodEnum<{
        indexed: "indexed";
        pending: "pending";
        refused: "refused";
    }>;
    reason: z.ZodNullable<z.ZodString>;
    modelName: z.ZodString;
    promptVersion: z.ZodString;
    indexedAt: z.ZodISODateTime;
}, z.core.$strict>;
export type GraphIndexEntry = z.output<typeof GraphIndexEntrySchema>;
export declare const GraphDecisionSchema: z.ZodObject<{
    owner: z.ZodString;
    action: z.ZodLiteral<"withdraw">;
    kind: z.ZodEnum<{
        link: "link";
        entity: "entity";
    }>;
    identity: z.ZodString;
    evidence: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type GraphDecision = z.output<typeof GraphDecisionSchema>;
export declare const GraphMergeSchema: z.ZodObject<{
    owner: z.ZodString;
    entities: z.ZodRecord<z.ZodString, z.ZodString>;
    links: z.ZodRecord<z.ZodString, z.ZodString>;
}, z.core.$strict>;
export type GraphMerge = z.output<typeof GraphMergeSchema>;
//# sourceMappingURL=indexing.d.ts.map