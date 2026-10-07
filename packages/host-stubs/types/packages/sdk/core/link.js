import { z } from "zod";
import { UuidShapeSchema } from "./uuid.js";
import { IdSchema, PersistentEntityIdSchema } from "./id.js";
import { JsonValueSchema } from "./json.js";
import { DerivedStatementSchema, DateTimeSchema } from "./statement.js";
export const LinkUnlinkRequestSchema = z.strictObject({ id: UuidShapeSchema });
export const LinkBaseSchema = z.strictObject({
    id: IdSchema,
    owner: IdSchema, // was userId — renamed with the column
    from: PersistentEntityIdSchema,
    to: PersistentEntityIdSchema,
    kind: z.string(),
    /** When we learned it. */
    createdAt: DateTimeSchema,
});
/** A link a connector or a rule wrote. Its provenance is the connector's
 *  stamp — the kind's own keys; provenance is the from entity's source — which
 *  every one of the 4907 links already carries. */
export const CanonicalLinkSchema = z.strictObject({
    ...LinkBaseSchema.shape,
    origin: z.literal("canonical"),
    /** The kind's own properties, validated at write against the kind's
     *  declaration — as Entity.properties is against the entity's. */
    metadata: JsonValueSchema,
    /** A record does not become false — but a membership is a record whose
     *  source itself reports its end. A canonical link may therefore carry a
     *  validity interval; it never carries confidence or evidence. */
    validFrom: DateTimeSchema.nullable(),
    validUntil: DateTimeSchema.nullable(),
});
/** A link a model wrote. */
export const DerivedLinkSchema = z.strictObject({ ...LinkBaseSchema.shape, ...DerivedStatementSchema.shape });
export const LinkSchema = z.discriminatedUnion("origin", [CanonicalLinkSchema, DerivedLinkSchema]);
/** The statement fields carried by every compact link projection. */
export const linkStatementProjectionShape = {
    confidence: z.number().gt(0).lte(1).nullable(),
    origin: z.enum(["canonical", "derived"]),
    validUntil: DateTimeSchema.nullable(),
};
export const LinkAddResultSchema = z.strictObject({
    id: IdSchema,
    kind: z.string(),
    from: IdSchema,
    to: IdSchema,
    created: z.boolean(),
});
