import { z } from "zod";
export declare const provisioningStatuses: readonly ["provisioning", "ready", "failed"];
export type WorkspaceProvisioningStatus = "provisioning" | "ready" | "failed";
export declare const WorkspaceProvisioningStatusSchema: z.ZodEnum<{
    ready: "ready";
    failed: "failed";
    provisioning: "provisioning";
}>;
export declare const provisioningPhases: readonly ["resolvingTemplate", "materializing", "complete"];
export type WorkspaceProvisioningPhase = "resolvingTemplate" | "materializing" | "complete";
export declare const WorkspaceProvisioningPhaseSchema: z.ZodEnum<{
    complete: "complete";
    resolvingTemplate: "resolvingTemplate";
    materializing: "materializing";
}>;
export interface WorkspaceProvisioningProgress {
    readonly phase: WorkspaceProvisioningPhase;
    readonly completedItems: number;
    readonly totalItems: number | null;
}
export declare const WorkspaceProvisioningProgressSchema: z.ZodObject<{
    phase: z.ZodEnum<{
        complete: "complete";
        resolvingTemplate: "resolvingTemplate";
        materializing: "materializing";
    }>;
    completedItems: z.ZodNumber;
    totalItems: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
//# sourceMappingURL=provisioning.d.ts.map