import { z } from "zod";
/** A profile's agent-facing identity. UI palette fields intentionally stay out. */
export declare const IdentityProfileSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    content: z.ZodString;
    isDefault: z.ZodBoolean;
    groupIds: z.ZodArray<z.ZodString>;
    groupNames: z.ZodArray<z.ZodString>;
    updatedAt: z.ZodString;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type IdentityProfile = z.output<typeof IdentityProfileSchema>;
export declare const IdentityProfileSummarySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    contentPreview: z.ZodString;
}, z.core.$strip>;
export type IdentityProfileSummary = z.output<typeof IdentityProfileSummarySchema>;
//# sourceMappingURL=identity.d.ts.map