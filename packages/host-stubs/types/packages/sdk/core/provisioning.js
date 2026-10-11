import { z } from "zod";
export const provisioningStatuses = ["provisioning", "ready", "failed"];
export const WorkspaceProvisioningStatusSchema = z.enum(provisioningStatuses);
export const provisioningPhases = ["resolvingTemplate", "materializing", "complete"];
export const WorkspaceProvisioningPhaseSchema = z.enum(provisioningPhases);
export const WorkspaceProvisioningProgressSchema = z.strictObject({
    phase: WorkspaceProvisioningPhaseSchema,
    completedItems: z.number().int().nonnegative(),
    totalItems: z.number().int().nonnegative().nullable(),
});
