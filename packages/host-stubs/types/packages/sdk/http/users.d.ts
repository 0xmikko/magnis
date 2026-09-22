import { z } from "zod";
export declare const userProfileContract: import("./contract.js").HttpContract<"GET", "/api/users/me", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strict>>;
export declare const updateUserProfileContract: import("./contract.js").HttpContract<"PATCH", "/api/users/me", z.ZodObject<{
    name: z.ZodString;
    surname: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strict>>;
export declare const setUserPasswordContract: import("./contract.js").HttpContract<"POST", "/api/users/me/password", z.ZodObject<{
    password: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"passwordSet">;
}, z.core.$strict>>;
export declare const retryUserWorkspaceProvisioningContract: import("./contract.js").HttpContract<"POST", "/api/users/me/workspace-provisioning/retry", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"provisioning">;
}, z.core.$strict>>;
//# sourceMappingURL=users.d.ts.map