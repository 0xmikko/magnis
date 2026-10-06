import { z } from "zod";
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
    readonly document: WorkspaceInstallationDocument | null;
} | {
    readonly state: "failed";
    /** The key that stopped the run. */
    readonly step: string;
    /** The backend's exact state_reason, or "interrupted by restart". */
    readonly failure: string;
    readonly document: WorkspaceInstallationDocument | null;
};
/** What the admin submits. Ids are the channel's plain ids. */
export declare const WorkspaceInstallationDocumentSchema: z.ZodObject<{
    name: z.ZodString;
    sources: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    embeddingModel: z.ZodString;
    engine: z.ZodEnum<{
        magnis: "magnis";
        codex: "codex";
        claude: "claude";
    }>;
    moduleSettings: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        moduleId: z.ZodString;
        values: z.ZodRecord<z.ZodString, z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    }, z.core.$strict>>>;
    accounts: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        fixtureId: z.ZodString;
        identityKey: z.ZodString;
        identityLabel: z.ZodString;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type WorkspaceInstallationDocument = z.output<typeof WorkspaceInstallationDocumentSchema>;
export declare const WorkspaceInstallationStatusSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    state: z.ZodLiteral<"not_installed">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"installing">;
    step: z.ZodString;
    completedItems: z.ZodNumber;
    totalItems: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"ready">;
    document: z.ZodNullable<z.ZodObject<{
        name: z.ZodString;
        sources: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        embeddingModel: z.ZodString;
        engine: z.ZodEnum<{
            magnis: "magnis";
            codex: "codex";
            claude: "claude";
        }>;
        moduleSettings: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            moduleId: z.ZodString;
            values: z.ZodRecord<z.ZodString, z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
        }, z.core.$strict>>>;
        accounts: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            sourceId: z.ZodString;
            fixtureId: z.ZodString;
            identityKey: z.ZodString;
            identityLabel: z.ZodString;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"failed">;
    step: z.ZodString;
    failure: z.ZodString;
    document: z.ZodNullable<z.ZodObject<{
        name: z.ZodString;
        sources: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        embeddingModel: z.ZodString;
        engine: z.ZodEnum<{
            magnis: "magnis";
            codex: "codex";
            claude: "claude";
        }>;
        moduleSettings: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            moduleId: z.ZodString;
            values: z.ZodRecord<z.ZodString, z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
        }, z.core.$strict>>>;
        accounts: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            sourceId: z.ZodString;
            fixtureId: z.ZodString;
            identityKey: z.ZodString;
            identityLabel: z.ZodString;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
}, z.core.$strict>], "state">;
//# sourceMappingURL=workspace-installation.d.ts.map