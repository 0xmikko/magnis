import { z } from "zod";
import { JsonValueSchema } from "../../core/json.js";
import { OkAckSchema, StatusAckSchema } from "../../core/rpc-response.js";
import { SourceKeysListSchema, SourceListResponseSchema } from "../../core/source.js";
import { RepairActionSchema, SourceAuthKindSchema } from "../../core/source-auth.js";
import { SourceStatusListResponseSchema } from "../../core/source-status.js";
import { defineRpcContract } from "../contract.js";
const sourceAuthSessionOpenSchema = z.object({
    sourceId: z.string().min(1),
    intent: z.enum(["add", "repair"]),
    presentation: z.enum(["web", "cli"]),
    connectionId: z.string().min(1).optional(),
    repairAction: RepairActionSchema.optional(),
    redirectUri: z.string().url().optional(),
}).superRefine((input, context) => {
    if (input.intent === "add") {
        if (input.connectionId !== undefined || input.repairAction !== undefined) {
            context.addIssue({
                code: "custom",
                message: "Add cannot name a Repair connection or action",
            });
        }
        return;
    }
    if (input.connectionId === undefined || input.repairAction === undefined) {
        context.addIssue({
            code: "custom",
            message: "Repair requires both connectionId and repairAction",
        });
    }
});
/**
 * @tested-by: tst_sdk_source_account_provision_001
 * @invariant: Add cannot name an account and Repair must name exactly one
 */
const sourceAccountsProvisionSchema = z.object({
    sourceId: z.string().min(1),
    intent: z.enum(["add", "repair"]).default("add"),
    connectionId: z.string().min(1).optional(),
}).superRefine((input, context) => {
    if (input.intent === "add" && input.connectionId !== undefined) {
        context.addIssue({
            code: "custom",
            message: "Add cannot name a Repair connection",
        });
    }
    if (input.intent === "repair" && input.connectionId === undefined) {
        context.addIssue({
            code: "custom",
            message: "Repair requires connectionId",
        });
    }
});
/** What `source.auth.exec` and `source.auth.oauth.complete` answer: the
 * redacted step outcome. The identity and the connection id ride together, on
 * the final `connected` step only. */
const authStepAnswerSchema = z.strictObject({
    status: z.string(),
    identity: JsonValueSchema.optional(),
    connectionId: z.string().optional(),
});
export const sourceContracts = {
    "source.accounts.disconnect": defineRpcContract({
        method: "source.accounts.disconnect",
        input: z.object({ sourceId: z.string(), accountId: z.string().min(1) }),
        output: OkAckSchema,
    }),
    "source.accounts.provision": defineRpcContract({
        method: "source.accounts.provision",
        input: sourceAccountsProvisionSchema,
        output: z.strictObject({ ok: z.literal(true), accountId: z.string(), subject: z.string() }),
    }),
    "source.auth.exec": defineRpcContract({
        method: "source.auth.exec",
        input: z.object({ sourceId: z.string(), sessionId: z.string(), op: z.string(), args: JsonValueSchema.optional() }),
        output: authStepAnswerSchema,
    }),
    "source.auth.oauth.complete": defineRpcContract({
        method: "source.auth.oauth.complete",
        input: z.object({ sourceId: z.string(), code: z.string().min(1), state: z.string().min(1) }),
        output: authStepAnswerSchema,
    }),
    "source.auth.session.cancel": defineRpcContract({
        method: "source.auth.session.cancel",
        input: z.object({ sourceId: z.string(), sessionId: z.string().min(1) }),
        output: z.strictObject({ cancelled: z.boolean() }),
    }),
    "source.auth.session.open": defineRpcContract({
        method: "source.auth.session.open",
        input: sourceAuthSessionOpenSchema,
        output: z.strictObject({ sessionId: z.string(), authType: SourceAuthKindSchema, redirectUrl: z.string().optional() }),
    }),
    "source.auth.submit": defineRpcContract({
        method: "source.auth.submit",
        input: z.object({ sourceId: z.string(), sessionId: z.string().min(1), step: z.string(), value: z.string() }),
        output: StatusAckSchema,
    }),
    "source.keys.list": defineRpcContract({
        method: "source.keys.list",
        input: z.object({ accountId: z.string().optional() }),
        output: SourceKeysListSchema,
    }),
    "source.keys.set": defineRpcContract({
        method: "source.keys.set",
        input: z.object({ sourceId: z.string(), key: z.string(), value: z.string(), accountId: z.string().optional() }),
        output: OkAckSchema,
    }),
    "source.list": defineRpcContract({
        method: "source.list",
        input: z.object({}),
        output: SourceListResponseSchema,
    }),
    "source.status.list": defineRpcContract({
        method: "source.status.list",
        input: z.object({}),
        output: SourceStatusListResponseSchema,
    }),
    "source.sync.bootstrap": defineRpcContract({
        method: "source.sync.bootstrap",
        input: z.object({ sourceId: z.string(), surface: z.string(), params: JsonValueSchema }),
        output: z.strictObject({ ok: z.literal(true), seeded: z.number().int().nonnegative() }),
    }),
};
