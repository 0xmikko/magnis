import { z } from "zod";
/** What the admin submits. Ids are the channel's plain ids. */
export interface WorkspaceInstallationDocument {
    /** The workspace's display name, shown in the workspace list. The wizard offers "Local Workspace". */
    readonly name: string;
    /** Accounts this workspace reads: "telegram", "google". Which modules it
     * runs is not the admin's answer to give — the server derives the set from
     * these, out of what the channel publishes. */
    readonly sources: readonly string[];
    /** Embedding model key as the search settings name it. */
    readonly embeddingModel: string;
}
/** What the workspace answers: its own record, and nothing else. What may
 * be installed is `extensions.list`'s answer and the AI models directory's;
 * the workspace answers the state of ITS installation. */
export type WorkspaceInstallationStatus = {
    readonly state: "not_installed";
} | {
    readonly state: "installing";
    /** The key being installed right now: "module:magnis.email", "source:magnis.telegram", "embedding:<key>". */
    readonly step: string;
    readonly completedItems: number;
    readonly totalItems: number;
} | {
    readonly state: "ready";
    readonly document: WorkspaceInstallationDocument;
} | {
    readonly state: "failed";
    /** The key that stopped the run. */
    readonly step: string;
    /** The backend's exact state_reason, or "interrupted by restart". */
    readonly failure: string;
    readonly document: WorkspaceInstallationDocument;
};
export declare const WorkspaceInstallationDocumentSchema: z.ZodObject<{
    name: z.ZodString;
    sources: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    embeddingModel: z.ZodString;
}, z.core.$strip>;
export declare const WorkspaceInstallationStatusSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    state: z.ZodLiteral<"not_installed">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"installing">;
    step: z.ZodString;
    completedItems: z.ZodNumber;
    totalItems: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"ready">;
    document: z.ZodObject<{
        name: z.ZodString;
        sources: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        embeddingModel: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"failed">;
    step: z.ZodString;
    failure: z.ZodString;
    document: z.ZodObject<{
        name: z.ZodString;
        sources: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        embeddingModel: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strict>], "state">;
//# sourceMappingURL=workspace-installation.d.ts.map