import { AgentImplementationIdSchema } from "./episode.js";
import { ModuleSettingsUpdateParamsSchema } from "./module-settings.js";
import { SourceFixtureProvisionInputSchema } from "./source.js";
import { z } from "zod";
/** What the admin submits. Ids are the channel's plain ids. */
export const WorkspaceInstallationDocumentSchema = z.strictObject({
    /** The workspace's display name, shown in the workspace list. The wizard offers "Local Workspace". */
    name: z.string().trim().min(1),
    /** Accounts this workspace reads: "telegram", "google". Which modules it
     * runs is not the admin's answer to give — the server derives the set from
     * these, out of what the channel publishes. */
    sources: z.array(z.string().min(1)).readonly(),
    /** Embedding model key as the search settings name it. */
    embeddingModel: z.string().min(1),
    engine: AgentImplementationIdSchema,
    moduleSettings: z.array(ModuleSettingsUpdateParamsSchema).readonly(),
    accounts: z.array(SourceFixtureProvisionInputSchema).readonly(),
}).superRefine((document, context) => {
    const unique = (values, field) => {
        if (new Set(values).size !== values.length) {
            context.addIssue({ code: "custom", path: [field], message: `duplicate ${field}` });
        }
    };
    unique(document.sources, "sources");
    unique(document.moduleSettings.map((entry) => entry.moduleId), "moduleSettings");
    unique(document.accounts.map((entry) => JSON.stringify([entry.sourceId, entry.fixtureId])), "accounts");
    document.moduleSettings.forEach((entry, index) => {
        if (entry.moduleId === "search" && "embedding_model" in entry.values) {
            context.addIssue({ code: "custom", path: ["moduleSettings", index, "values", "embedding_model"],
                message: "use embeddingModel for the search model" });
        }
    });
    document.accounts.forEach((entry, index) => {
        if (!document.sources.includes(entry.sourceId)) {
            context.addIssue({ code: "custom", path: ["accounts", index, "sourceId"],
                message: "fixture source must belong to sources" });
        }
    });
});
export const WorkspaceInstallationStatusSchema = z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("not_installed") }),
    z.strictObject({
        state: z.literal("installing"),
        step: z.string(),
        completedItems: z.number().int().nonnegative(),
        totalItems: z.number().int().nonnegative(),
    }),
    z.strictObject({
        state: z.literal("ready"),
        document: WorkspaceInstallationDocumentSchema.nullable(),
    }),
    z.strictObject({
        state: z.literal("failed"),
        step: z.string(),
        failure: z.string(),
        document: WorkspaceInstallationDocumentSchema.nullable(),
    }),
]);
