import { z } from "zod";
import { type Id } from "./id.js";
import { type JsonValue } from "./json.js";
import type { EntityId, UserId } from "./entity.js";
import { type AgentStatement, type DateTimeUtc } from "./statement.js";
export type LinkId = Id;
export type LinkType = string;
interface LinkBase {
    id: LinkId;
    owner: UserId;
    from: EntityId;
    to: EntityId;
    kind: string;
    /** When we learned it. */
    createdAt: DateTimeUtc;
}
/** A link a connector or a rule wrote. Its provenance is the connector's
 *  stamp — the kind's own keys; provenance is the from entity's source — which
 *  every one of the 4907 links already carries. */
export interface CanonicalLink extends LinkBase {
    origin: "canonical";
    /** The kind's own properties, validated at write against the kind's
     *  declaration — as Entity.properties is against the entity's. */
    metadata: JsonValue;
}
/** A link a model wrote. */
export interface AgentLink extends LinkBase, AgentStatement {
}
export type Link = CanonicalLink | AgentLink;
export declare const linkSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    origin: z.ZodLiteral<"canonical">;
    metadata: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
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
export declare const LinkSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    origin: z.ZodLiteral<"canonical">;
    metadata: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
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
export {};
//# sourceMappingURL=link.d.ts.map