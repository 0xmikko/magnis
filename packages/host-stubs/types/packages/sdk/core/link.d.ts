import { z } from "zod";
import { type Id } from "./id.js";
export type LinkId = Id;
export type LinkType = string;
export declare const LinkUnlinkRequestSchema: z.ZodObject<{
    id: z.ZodGUID;
}, z.core.$strict>;
export declare const LinkBaseSchema: z.ZodObject<{
    id: z.ZodString;
    owner: z.ZodString;
    from: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    to: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    kind: z.ZodString;
    createdAt: z.ZodISODateTime;
}, z.core.$strict>;
export type LinkBase = z.output<typeof LinkBaseSchema>;
/** A link a connector or a rule wrote. Its provenance is the connector's
 *  stamp — the kind's own keys; provenance is the from entity's source — which
 *  every one of the 4907 links already carries. */
export declare const CanonicalLinkSchema: z.ZodObject<{
    origin: z.ZodLiteral<"canonical">;
    metadata: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
    id: z.ZodString;
    owner: z.ZodString;
    from: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    to: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    kind: z.ZodString;
    createdAt: z.ZodISODateTime;
}, z.core.$strict>;
export type CanonicalLink = z.output<typeof CanonicalLinkSchema>;
/** A link a model wrote. */
export declare const DerivedLinkSchema: z.ZodObject<{
    origin: z.ZodLiteral<"derived">;
    confidence: z.ZodNumber;
    evidence: z.ZodTuple<[z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">], z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">>;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
    id: z.ZodString;
    owner: z.ZodString;
    from: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    to: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    kind: z.ZodString;
    createdAt: z.ZodISODateTime;
}, z.core.$strict>;
export type DerivedLink = z.output<typeof DerivedLinkSchema>;
export declare const LinkSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    origin: z.ZodLiteral<"canonical">;
    metadata: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
    id: z.ZodString;
    owner: z.ZodString;
    from: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    to: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    kind: z.ZodString;
    createdAt: z.ZodISODateTime;
}, z.core.$strict>, z.ZodObject<{
    origin: z.ZodLiteral<"derived">;
    confidence: z.ZodNumber;
    evidence: z.ZodTuple<[z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">], z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">>;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
    id: z.ZodString;
    owner: z.ZodString;
    from: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    to: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    kind: z.ZodString;
    createdAt: z.ZodISODateTime;
}, z.core.$strict>], "origin">;
export type Link = z.output<typeof LinkSchema>;
export type CreatedLink = Link & {
    kind: "created";
};
export type BelongsToLink = Link & {
    kind: "belongs_to";
};
/** The statement fields carried by every compact link projection. */
export declare const linkStatementProjectionShape: {
    confidence: z.ZodNullable<z.ZodNumber>;
    origin: z.ZodEnum<{
        canonical: "canonical";
        derived: "derived";
    }>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
};
export declare const LinkAddResultSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    created: z.ZodBoolean;
}, z.core.$strict>;
export type LinkAddResult = z.output<typeof LinkAddResultSchema>;
//# sourceMappingURL=link.d.ts.map