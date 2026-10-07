import { z } from "zod";
import { type Id, type PersistentEntityId } from "./id.js";
import type { CanonicalEntity } from "./entity.js";
import type { JsonObject } from "./json.js";
/** Authentication scope may include nil; a graph user always has an assigned ID. */
export type AuthUserId = Id;
export type { UserId } from "./entity.js";
export interface UserEntityBinding {
    authUserId: AuthUserId;
    entityId: PersistentEntityId;
}
export interface UserEntityProperties extends JsonObject {
    name: string;
    surname: string | null;
}
export interface UserEntity extends CanonicalEntity<UserEntityProperties> {
    id: PersistentEntityId;
    schemaId: "users.user";
}
export declare const GraphStatisticsSchema: z.ZodObject<{
    entities: z.ZodNumber;
    links: z.ZodNumber;
    indexable: z.ZodNumber;
    indexed: z.ZodNumber;
}, z.core.$strict>;
export type GraphStatistics = z.output<typeof GraphStatisticsSchema>;
export declare const WorkspaceProvisioningViewSchema: z.ZodObject<{
    status: z.ZodEnum<{
        failed: "failed";
        ready: "ready";
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
export type WorkspaceProvisioningView = z.output<typeof WorkspaceProvisioningViewSchema>;
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
            failed: "failed";
            ready: "ready";
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
export type UserProfile = z.output<typeof UserProfileSchema>;
//# sourceMappingURL=user.d.ts.map