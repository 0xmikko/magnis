import { z } from "zod";
export declare const workspaceContract: import("./contract.js").HttpContract<"GET", "/api/workspace", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    membershipMode: z.ZodEnum<{
        singleUser: "singleUser";
        multiUser: "multiUser";
    }>;
    authenticationMethod: z.ZodEnum<{
        open: "open";
        google: "google";
        password: "password";
    }>;
}, z.core.$strict>>;
export declare const exportWorkspaceContract: import("./contract.js").HttpContract<"GET", "/api/workspace/export", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    sha256: z.ZodString;
    document: z.ZodString;
}, z.core.$strict>>;
export declare const importWorkspaceContract: import("./contract.js").HttpContract<"POST", "/api/workspace/import", z.ZodObject<{
    document: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    sha256: z.ZodString;
    status: z.ZodEnum<{
        imported: "imported";
        alreadyImported: "alreadyImported";
    }>;
}, z.core.$strict>>;
/** The installation record on the workspace singleton. Admin only. */
export declare const getWorkspaceInstallationContract: import("./contract.js").HttpContract<"GET", "/api/workspace/installation", z.ZodObject<{}, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
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
            values: z.ZodRecord<z.ZodString, z.ZodType<import("../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../index.js").JsonValue, unknown>>>;
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
            values: z.ZodRecord<z.ZodString, z.ZodType<import("../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../index.js").JsonValue, unknown>>>;
        }, z.core.$strict>>>;
        accounts: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            sourceId: z.ZodString;
            fixtureId: z.ZodString;
            identityKey: z.ZodString;
            identityLabel: z.ZodString;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
}, z.core.$strict>], "state">>;
/** Submit the ONE document the server installs. Admin only; 409 while a run
 * is in progress. Answers once the row says installing — the run continues on
 * the server, and the browser polls the status above. */
export declare const startWorkspaceInstallationContract: import("./contract.js").HttpContract<"POST", "/api/workspace/installation", z.ZodObject<{
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
        values: z.ZodRecord<z.ZodString, z.ZodType<import("../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../index.js").JsonValue, unknown>>>;
    }, z.core.$strict>>>;
    accounts: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        fixtureId: z.ZodString;
        identityKey: z.ZodString;
        identityLabel: z.ZodString;
    }, z.core.$strict>>>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodEnum<{
        ready: "ready";
        installing: "installing";
    }>;
}, z.core.$strict>>;
/** What that document WOULD install, in the order the run would walk it —
 * every key, `module:` and `source:` and the embedding model, as the run
 * names them. Admin only. It installs nothing: it is what the last screen
 * before `Install` shows. */
export declare const previewWorkspaceInstallationContract: import("./contract.js").HttpContract<"POST", "/api/workspace/installation/preview", z.ZodObject<{
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
        values: z.ZodRecord<z.ZodString, z.ZodType<import("../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../index.js").JsonValue, unknown>>>;
    }, z.core.$strict>>>;
    accounts: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        fixtureId: z.ZodString;
        identityKey: z.ZodString;
        identityLabel: z.ZodString;
    }, z.core.$strict>>>;
}, z.core.$strict>, z.ZodObject<{
    steps: z.ZodArray<z.ZodString>;
}, z.core.$strict>>;
export declare const workspaceLoginContract: import("./contract.js").HttpContract<"POST", "/api/workspace/auth/login", z.ZodObject<{
    email: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    password: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>, z.ZodObject<{
    token: z.ZodString;
}, z.core.$strict>>;
export declare const workspaceLogoutContract: import("./contract.js").HttpContract<"POST", "/api/workspace/auth/logout", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"loggedOut">;
}, z.core.$strict>>;
export declare const workspaceGoogleAuthStartContract: import("./contract.js").HttpContract<"POST", "/api/workspace/auth/google/start", z.ZodObject<{
    redirectUri: z.ZodString;
    source: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    authorizeUrl: z.ZodString;
    state: z.ZodString;
}, z.core.$strict>>;
export declare const workspaceGoogleAuthExchangeContract: import("./contract.js").HttpContract<"POST", "/api/workspace/auth/google/exchange", z.ZodObject<{
    code: z.ZodString;
    state: z.ZodString;
    redirectUri: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    token: z.ZodString;
}, z.core.$strict>>;
/** Effective portable configuration for the requesting administrator. */
export declare const getWorkspaceInstallationDocumentContract: import("./contract.js").HttpContract<"GET", "/api/workspace/installation/document", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
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
        values: z.ZodRecord<z.ZodString, z.ZodType<import("../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../index.js").JsonValue, unknown>>>;
    }, z.core.$strict>>>;
    accounts: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        fixtureId: z.ZodString;
        identityKey: z.ZodString;
        identityLabel: z.ZodString;
    }, z.core.$strict>>>;
}, z.core.$strict>>;
//# sourceMappingURL=workspace.d.ts.map