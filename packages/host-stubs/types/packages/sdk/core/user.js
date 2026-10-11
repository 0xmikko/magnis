import { z } from "zod";
import { IdSchema } from "./id.js";
import { WorkspaceProvisioningProgressSchema, WorkspaceProvisioningStatusSchema } from "./provisioning.js";
export const GraphStatisticsSchema = z.strictObject({
    entities: z.number().int().nonnegative(),
    links: z.number().int().nonnegative(),
    indexable: z.number().int().nonnegative(),
    indexed: z.number().int().nonnegative(),
});
export const WorkspaceProvisioningViewSchema = z.strictObject({
    status: WorkspaceProvisioningStatusSchema,
    progress: WorkspaceProvisioningProgressSchema.nullable(),
});
export const UserProfileSchema = z.strictObject({
    id: IdSchema,
    name: z.string(),
    surname: z.string().nullable(),
    email: z.string().nullable(),
    isAdmin: z.boolean(),
    statistics: z.strictObject({
        user: GraphStatisticsSchema,
        workspace: GraphStatisticsSchema,
    }),
    workspaceProvisioning: WorkspaceProvisioningViewSchema.optional(),
});
