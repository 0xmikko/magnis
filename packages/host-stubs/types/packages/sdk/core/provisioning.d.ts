import { z } from "zod";
export declare const provisioningStatuses: readonly ["provisioning", "ready", "failed"];
export declare const WorkspaceProvisioningStatusSchema: z.ZodEnum<{
    failed: "failed";
    ready: "ready";
    provisioning: "provisioning";
}>;
export type WorkspaceProvisioningStatus = z.output<typeof WorkspaceProvisioningStatusSchema>;
export declare const provisioningPhases: readonly ["resolvingTemplate", "materializing", "complete"];
export declare const WorkspaceProvisioningPhaseSchema: z.ZodEnum<{
    complete: "complete";
    resolvingTemplate: "resolvingTemplate";
    materializing: "materializing";
}>;
export type WorkspaceProvisioningPhase = z.output<typeof WorkspaceProvisioningPhaseSchema>;
export declare const WorkspaceProvisioningProgressSchema: z.ZodObject<{
    phase: z.ZodEnum<{
        complete: "complete";
        resolvingTemplate: "resolvingTemplate";
        materializing: "materializing";
    }>;
    completedItems: z.ZodNumber;
    totalItems: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export type WorkspaceProvisioningProgress = z.output<typeof WorkspaceProvisioningProgressSchema>;
//# sourceMappingURL=provisioning.d.ts.map