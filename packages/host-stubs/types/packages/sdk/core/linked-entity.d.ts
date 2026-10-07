import { z } from "zod";
/** A compact projection of an entity attached to another read model. */
export declare const LinkedEntitySummarySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    schemaId: z.ZodString;
    linkKind: z.ZodString;
    direction: z.ZodEnum<{
        in: "in";
        out: "out";
    }>;
    createdAt: z.ZodString;
    data: z.ZodOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    confidence: z.ZodNullable<z.ZodNumber>;
    origin: z.ZodEnum<{
        canonical: "canonical";
        derived: "derived";
    }>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
}, z.core.$strict>;
export type LinkedEntitySummary = z.output<typeof LinkedEntitySummarySchema>;
//# sourceMappingURL=linked-entity.d.ts.map