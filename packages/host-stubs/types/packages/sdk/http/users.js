import { z } from "zod";
import { UserProfileSchema } from "../core/user.js";
import { defineHttpContract } from "./contract.js";
export const userProfileContract = defineHttpContract({
    method: "GET",
    path: "/api/users/me",
    input: z.object({}),
    output: UserProfileSchema,
});
export const updateUserProfileContract = defineHttpContract({
    method: "PATCH",
    path: "/api/users/me",
    input: z.object({ name: z.string(), surname: z.string().nullable() }),
    output: UserProfileSchema,
});
export const setUserPasswordContract = defineHttpContract({
    method: "POST",
    path: "/api/users/me/password",
    input: z.object({ password: z.string().min(1) }),
    output: z.strictObject({ status: z.literal("passwordSet") }),
});
export const retryUserWorkspaceProvisioningContract = defineHttpContract({
    method: "POST",
    path: "/api/users/me/workspace-provisioning/retry",
    input: z.object({}),
    output: z.strictObject({ status: z.literal("provisioning") }),
});
