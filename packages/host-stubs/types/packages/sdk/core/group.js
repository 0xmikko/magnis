import { z } from "zod";
import { IdSchema } from "./id.js";
import { IdentityProfileSummarySchema } from "./identity.js";
export const GroupListItemSchema = z.strictObject({
    id: IdSchema,
    name: z.string(),
    description: z.string(),
    memory: z.string(),
    memberCount: z.number().int().nonnegative(),
    identityProfileName: z.string().nullable(),
    createdAt: z.string(),
});
export const GroupDetailViewSchema = GroupListItemSchema.extend({
    identityProfiles: z.array(IdentityProfileSummarySchema),
}).omit({
    identityProfileName: true,
});
export const GroupMemberItemSchema = z.strictObject({
    entityId: IdSchema,
    name: z.string().nullable(),
    schemaId: z.string(),
});
export const ResolvedGroupIdentitySchema = z.strictObject({
    groupId: IdSchema,
    groupName: z.string(),
    description: z.string(),
    memory: z.string(),
    identityProfiles: z.array(IdentityProfileSummarySchema),
});
