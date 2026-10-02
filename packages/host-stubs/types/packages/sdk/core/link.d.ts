import { z } from "zod";
import { type Id } from "./id.js";
export type LinkId = Id;
export type LinkType = string;
export declare const LinkUnlinkRequestSchema: z.ZodObject<{
    id: z.ZodGUID;
}, z.core.$strip>;
export declare const linkBaseSchema: z.ZodObject<{
    id: z.ZodString;
    owner: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    kind: z.ZodString;
    createdAt: z.ZodISODateTime;
}, z.core.$strict>;
export type LinkBase = z.output<typeof linkBaseSchema>;
/** A link a connector or a rule wrote. Its provenance is the connector's
 *  stamp — the kind's own keys; provenance is the from entity's source — which
 *  every one of the 4907 links already carries. */
export declare const canonicalLinkSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type CanonicalLink = z.output<typeof canonicalLinkSchema>;
/** A link a model wrote. */
export declare const agentLinkSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type AgentLink = z.output<typeof agentLinkSchema>;
export declare const linkSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
}, z.core.$strict>], "origin">;
export type Link = z.output<typeof linkSchema>;
export declare const LinkSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
}, z.core.$strict>], "origin">;
/** The statement fields carried by every compact link projection. */
export declare const linkStatementProjectionShape: {
    confidence: z.ZodNullable<z.ZodNumber>;
    origin: z.ZodEnum<{
        canonical: "canonical";
        agent: "agent";
    }>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
};
export declare const LinkAddResultSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    created: z.ZodBoolean;
}, z.core.$strip>;
export type LinkAddResult = z.output<typeof LinkAddResultSchema>;
//# sourceMappingURL=link.d.ts.map