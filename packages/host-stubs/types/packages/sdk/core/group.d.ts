import { z } from "zod";
export declare const GroupListItemSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    memory: z.ZodString;
    memberCount: z.ZodNumber;
    identityProfileName: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type GroupListItem = z.output<typeof GroupListItemSchema>;
export declare const GroupDetailViewSchema: z.ZodObject<{
    name: z.ZodString;
    id: z.ZodString;
    description: z.ZodString;
    createdAt: z.ZodString;
    memory: z.ZodString;
    memberCount: z.ZodNumber;
    identityProfiles: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        contentPreview: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type GroupDetailView = z.output<typeof GroupDetailViewSchema>;
export declare const GroupMemberItemSchema: z.ZodObject<{
    entityId: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    schemaId: z.ZodString;
}, z.core.$strip>;
export type GroupMemberItem = z.output<typeof GroupMemberItemSchema>;
export declare const ResolvedGroupIdentitySchema: z.ZodObject<{
    groupId: z.ZodString;
    groupName: z.ZodString;
    description: z.ZodString;
    memory: z.ZodString;
    identityProfiles: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        contentPreview: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ResolvedGroupIdentity = z.output<typeof ResolvedGroupIdentitySchema>;
//# sourceMappingURL=group.d.ts.map