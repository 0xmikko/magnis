import { z } from "zod";
import type { WorkspaceProvisioningProgress, WorkspaceProvisioningStatus } from "./provisioning.js";
export interface GraphStatistics {
    readonly entities: number;
    readonly links: number;
    readonly indexable: number;
    readonly indexed: number;
}
export interface WorkspaceProvisioningView {
    readonly status: WorkspaceProvisioningStatus;
    readonly progress: WorkspaceProvisioningProgress | null;
}
export interface UserProfile {
    readonly id: string;
    readonly name: string;
    readonly surname: string | null;
    readonly email: string | null;
    readonly isAdmin: boolean;
    readonly statistics: {
        readonly user: GraphStatistics;
        readonly workspace: GraphStatistics;
    };
    readonly workspaceProvisioning?: WorkspaceProvisioningView | undefined;
}
export declare const GraphStatisticsSchema: z.ZodObject<{
    entities: z.ZodNumber;
    links: z.ZodNumber;
    indexable: z.ZodNumber;
    indexed: z.ZodNumber;
}, z.core.$strict>;
export declare const WorkspaceProvisioningViewSchema: z.ZodObject<{
    status: z.ZodEnum<{
        ready: "ready";
        failed: "failed";
        provisioning: "provisioning";
    }>;
    progress: z.ZodNullable<z.ZodObject<{
        phase: z.ZodEnum<{
            complete: "complete";
            resolvingTemplate: "resolvingTemplate";
            materializing: "materializing";
        }>;
        completedItems: z.ZodNumber;
        totalItems: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const UserProfileSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    surname: z.ZodNullable<z.ZodString>;
    email: z.ZodNullable<z.ZodString>;
    isAdmin: z.ZodBoolean;
    statistics: z.ZodObject<{
        user: z.ZodObject<{
            entities: z.ZodNumber;
            links: z.ZodNumber;
            indexable: z.ZodNumber;
            indexed: z.ZodNumber;
        }, z.core.$strict>;
        workspace: z.ZodObject<{
            entities: z.ZodNumber;
            links: z.ZodNumber;
            indexable: z.ZodNumber;
            indexed: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>;
    workspaceProvisioning: z.ZodOptional<z.ZodObject<{
        status: z.ZodEnum<{
            ready: "ready";
            failed: "failed";
            provisioning: "provisioning";
        }>;
        progress: z.ZodNullable<z.ZodObject<{
            phase: z.ZodEnum<{
                complete: "complete";
                resolvingTemplate: "resolvingTemplate";
                materializing: "materializing";
            }>;
            completedItems: z.ZodNumber;
            totalItems: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
//# sourceMappingURL=user.d.ts.map