import { z } from "zod";
export declare const SourceProtocolVersionSchema: z.ZodEnum<{
    "magnis.source/1": "magnis.source/1";
    "magnis.source/2": "magnis.source/2";
}>;
export declare const SourceAuthoritySchema: z.ZodEnum<{
    moduleSync: "moduleSync";
    toolsOnly: "toolsOnly";
}>;
export declare const SourceReleaseTierSchema: z.ZodEnum<{
    production: "production";
    developmentFixture: "developmentFixture";
}>;
export declare const SourceDeliveryModeSchema: z.ZodEnum<{
    push: "push";
    none: "none";
    poll: "poll";
}>;
export declare const CanonicalSourceAuthKindSchema: z.ZodEnum<{
    oauth2: "oauth2";
    phoneCode: "phoneCode";
    apiKey: "apiKey";
    sharedProvider: "sharedProvider";
}>;
export declare const SourceCertificationReceiptSchema: z.ZodObject<{
    authority: z.ZodEnum<{
        moduleSync: "moduleSync";
        toolsOnly: "toolsOnly";
    }>;
    releaseTier: z.ZodEnum<{
        production: "production";
        developmentFixture: "developmentFixture";
    }>;
    auth: z.ZodNullable<z.ZodEnum<{
        oauth2: "oauth2";
        phoneCode: "phoneCode";
        apiKey: "apiKey";
        sharedProvider: "sharedProvider";
    }>>;
    runtime: z.ZodObject<{
        kind: z.ZodEnum<{
            custom: "custom";
            connectorSdk: "connectorSdk";
            externalWrapped: "externalWrapped";
        }>;
        implementationHash: z.ZodString;
        version: z.ZodString;
    }, z.core.$strict>;
    packageHash: z.ZodString;
    sourceId: z.ZodString;
    protocol: z.ZodEnum<{
        "magnis.source/1": "magnis.source/1";
        "magnis.source/2": "magnis.source/2";
    }>;
    definitionHash: z.ZodString;
    accountCompatibility: z.ZodObject<{
        hash: z.ZodString;
        migratesFrom: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
    delivery: z.ZodEnum<{
        push: "push";
        none: "none";
        poll: "poll";
    }>;
    surfaces: z.ZodArray<z.ZodString>;
    advertisedTools: z.ZodArray<z.ZodString>;
    callableOperations: z.ZodArray<z.ZodString>;
    initialize: z.ZodObject<{
        mcpProtocolVersion: z.ZodString;
        serverInfoName: z.ZodString;
        serverInfoVersion: z.ZodString;
        capabilitiesHash: z.ZodString;
    }, z.core.$strict>;
    interfaceHashes: z.ZodArray<z.ZodString>;
    scenarioIds: z.ZodArray<z.ZodString>;
    certifierVersion: z.ZodString;
    testkitVersion: z.ZodString;
    matrixVersion: z.ZodString;
}, z.core.$strict>;
export type SourceCertificationReceipt = z.output<typeof SourceCertificationReceiptSchema>;
/** Catalog sidecars are strict snake-case wire evidence. The app decodes them
 * once into the canonical camel-case receipt; it never accepts either spelling
 * as an alias on the same boundary. */
export declare const SourceCertificationReceiptWireSchema: z.ZodPipe<z.ZodObject<{
    authority: z.ZodEnum<{
        module_sync: "module_sync";
        tools_only: "tools_only";
    }>;
    releaseTier: z.ZodEnum<{
        production: "production";
        development_fixture: "development_fixture";
    }>;
    auth: z.ZodNullable<z.ZodEnum<{
        api_key: "api_key";
        oauth2: "oauth2";
        phone_code: "phone_code";
        shared_provider: "shared_provider";
    }>>;
    runtime: z.ZodObject<{
        kind: z.ZodEnum<{
            custom: "custom";
            connector_sdk: "connector_sdk";
            external_wrapped: "external_wrapped";
        }>;
        implementationHash: z.ZodString;
        version: z.ZodString;
    }, z.core.$strict>;
    packageHash: z.ZodString;
    sourceId: z.ZodString;
    protocol: z.ZodEnum<{
        "magnis.source/1": "magnis.source/1";
        "magnis.source/2": "magnis.source/2";
    }>;
    definitionHash: z.ZodString;
    accountCompatibility: z.ZodObject<{
        hash: z.ZodString;
        migratesFrom: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
    delivery: z.ZodEnum<{
        push: "push";
        none: "none";
        poll: "poll";
    }>;
    surfaces: z.ZodArray<z.ZodString>;
    advertisedTools: z.ZodArray<z.ZodString>;
    callableOperations: z.ZodArray<z.ZodString>;
    initialize: z.ZodObject<{
        mcpProtocolVersion: z.ZodString;
        serverInfoName: z.ZodString;
        serverInfoVersion: z.ZodString;
        capabilitiesHash: z.ZodString;
    }, z.core.$strict>;
    interfaceHashes: z.ZodArray<z.ZodString>;
    scenarioIds: z.ZodArray<z.ZodString>;
    certifierVersion: z.ZodString;
    testkitVersion: z.ZodString;
    matrixVersion: z.ZodString;
}, z.core.$strict>, z.ZodTransform<{
    authority: "moduleSync" | "toolsOnly";
    releaseTier: "production" | "developmentFixture";
    auth: "oauth2" | "phoneCode" | "apiKey" | "sharedProvider" | null;
    runtime: {
        kind: "custom" | "connectorSdk" | "externalWrapped";
        implementationHash: string;
        version: string;
    };
    packageHash: string;
    sourceId: string;
    protocol: "magnis.source/1" | "magnis.source/2";
    definitionHash: string;
    accountCompatibility: {
        hash: string;
        migratesFrom: string[];
    };
    delivery: "push" | "none" | "poll";
    surfaces: string[];
    advertisedTools: string[];
    callableOperations: string[];
    initialize: {
        mcpProtocolVersion: string;
        serverInfoName: string;
        serverInfoVersion: string;
        capabilitiesHash: string;
    };
    interfaceHashes: string[];
    scenarioIds: string[];
    certifierVersion: string;
    testkitVersion: string;
    matrixVersion: string;
}, {
    authority: "module_sync" | "tools_only";
    releaseTier: "production" | "development_fixture";
    auth: "api_key" | "oauth2" | "phone_code" | "shared_provider" | null;
    runtime: {
        kind: "custom" | "connector_sdk" | "external_wrapped";
        implementationHash: string;
        version: string;
    };
    packageHash: string;
    sourceId: string;
    protocol: "magnis.source/1" | "magnis.source/2";
    definitionHash: string;
    accountCompatibility: {
        hash: string;
        migratesFrom: string[];
    };
    delivery: "push" | "none" | "poll";
    surfaces: string[];
    advertisedTools: string[];
    callableOperations: string[];
    initialize: {
        mcpProtocolVersion: string;
        serverInfoName: string;
        serverInfoVersion: string;
        capabilitiesHash: string;
    };
    interfaceHashes: string[];
    scenarioIds: string[];
    certifierVersion: string;
    testkitVersion: string;
    matrixVersion: string;
}>>;
export declare const SourceAccountLifecycleSchema: z.ZodEnum<{
    connected: "connected";
    authRequired: "authRequired";
    disconnecting: "disconnecting";
    revokePending: "revokePending";
    revoked: "revoked";
    invalid: "invalid";
}>;
export type SourceAccountLifecycle = z.output<typeof SourceAccountLifecycleSchema>;
export declare const SourceCredentialLocatorKindSchema: z.ZodEnum<{
    minted: "minted";
    userKey: "userKey";
    deploymentKey: "deploymentKey";
    fixture: "fixture";
}>;
export declare const SourceCredentialLocatorSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"minted">;
    namespace: z.ZodString;
    subjectId: z.ZodString;
    secretKey: z.ZodString;
    revision: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"userKey">;
    namespace: z.ZodString;
    subjectId: z.ZodString;
    secretKey: z.ZodString;
    revision: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"deploymentKey">;
    namespace: z.ZodString;
    subjectId: z.ZodString;
    secretKey: z.ZodString;
    revision: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"fixture">;
    fixtureId: z.ZodString;
}, z.core.$strict>], "kind">;
export type SourceCredentialLocator = z.output<typeof SourceCredentialLocatorSchema>;
export declare const SourceAccountGenerationSchema: z.ZodObject<{
    connectionId: z.ZodString;
    userId: z.ZodString;
    sourceId: z.ZodString;
    accountId: z.ZodString;
    displayName: z.ZodString;
    authKind: z.ZodEnum<{
        oauth2: "oauth2";
        phoneCode: "phoneCode";
        apiKey: "apiKey";
        sharedProvider: "sharedProvider";
    }>;
    generation: z.ZodNumber;
    lifecycle: z.ZodEnum<{
        connected: "connected";
        authRequired: "authRequired";
        disconnecting: "disconnecting";
        revokePending: "revokePending";
        revoked: "revoked";
        invalid: "invalid";
    }>;
    providerAccountId: z.ZodNullable<z.ZodString>;
    artifactHash: z.ZodNullable<z.ZodString>;
    accountCompatibilityHash: z.ZodNullable<z.ZodString>;
    credentialLocator: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"minted">;
        namespace: z.ZodString;
        subjectId: z.ZodString;
        secretKey: z.ZodString;
        revision: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"userKey">;
        namespace: z.ZodString;
        subjectId: z.ZodString;
        secretKey: z.ZodString;
        revision: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"deploymentKey">;
        namespace: z.ZodString;
        subjectId: z.ZodString;
        secretKey: z.ZodString;
        revision: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"fixture">;
        fixtureId: z.ZodString;
    }, z.core.$strict>], "kind">>;
    invalidReason: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type SourceAccountGeneration = z.output<typeof SourceAccountGenerationSchema>;
export declare const SourceManifestSchema: z.ZodObject<{
    sourceId: z.ZodString;
    displayName: z.ZodString;
    surfaces: z.ZodArray<z.ZodString>;
    authType: z.ZodEnum<{
        none: "none";
        oauth2: "oauth2";
        phoneCode: "phoneCode";
        apiKey: "apiKey";
        sharedProvider: "sharedProvider";
    }>;
    packageHash: z.ZodString;
    connectable: z.ZodBoolean;
    unavailableReason: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type SourceManifest = z.output<typeof SourceManifestSchema>;
export declare const SourceListResponseSchema: z.ZodObject<{
    sources: z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        displayName: z.ZodString;
        surfaces: z.ZodArray<z.ZodString>;
        authType: z.ZodEnum<{
            none: "none";
            oauth2: "oauth2";
            phoneCode: "phoneCode";
            apiKey: "apiKey";
            sharedProvider: "sharedProvider";
        }>;
        packageHash: z.ZodString;
        connectable: z.ZodBoolean;
        unavailableReason: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SourceListResponse = z.output<typeof SourceListResponseSchema>;
export declare const SourceAccountSchema: z.ZodObject<{
    sourceId: z.ZodString;
    accountId: z.ZodString;
    surfaces: z.ZodArray<z.ZodString>;
    status: z.ZodString;
    sync: z.ZodOptional<z.ZodArray<z.ZodObject<{
        surface: z.ZodString;
        phase: z.ZodNullable<z.ZodString>;
        status: z.ZodString;
        lastSyncAt: z.ZodNullable<z.ZodString>;
        lastError: z.ZodNullable<z.ZodString>;
        nextRetryAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type SourceAccount = z.output<typeof SourceAccountSchema>;
export declare const SourceAccountsListResponseSchema: z.ZodObject<{
    accounts: z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        accountId: z.ZodString;
        surfaces: z.ZodArray<z.ZodString>;
        status: z.ZodString;
        sync: z.ZodOptional<z.ZodArray<z.ZodObject<{
            surface: z.ZodString;
            phase: z.ZodNullable<z.ZodString>;
            status: z.ZodString;
            lastSyncAt: z.ZodNullable<z.ZodString>;
            lastError: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SourceAccountsListResponse = z.output<typeof SourceAccountsListResponseSchema>;
export declare const SourceKeyStatusSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    helpUrl: z.ZodNullable<z.ZodString>;
    description: z.ZodNullable<z.ZodString>;
    vaultConfigured: z.ZodBoolean;
}, z.core.$strip>;
export type SourceKeyStatus = z.output<typeof SourceKeyStatusSchema>;
export declare const SourceKeysEntrySchema: z.ZodObject<{
    sourceId: z.ZodString;
    displayName: z.ZodString;
    keys: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        helpUrl: z.ZodNullable<z.ZodString>;
        description: z.ZodNullable<z.ZodString>;
        vaultConfigured: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SourceKeysEntry = z.output<typeof SourceKeysEntrySchema>;
export declare const SourceKeysListSchema: z.ZodObject<{
    vaultAvailable: z.ZodBoolean;
    sources: z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        displayName: z.ZodString;
        keys: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            helpUrl: z.ZodNullable<z.ZodString>;
            description: z.ZodNullable<z.ZodString>;
            vaultConfigured: z.ZodBoolean;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SourceKeysList = z.output<typeof SourceKeysListSchema>;
export interface SourceAppConfigKey {
    readonly key: string;
    readonly label: string;
    readonly deploymentConfigured: boolean;
}
export declare const SourceAppConfigKeySchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    deploymentConfigured: z.ZodBoolean;
}, z.core.$strip>;
export type SourceAppConfigCategory = "sharedProvider" | "module";
export interface SourceAppConfigEntry {
    readonly sourceId: string;
    readonly displayName: string;
    readonly category: SourceAppConfigCategory;
    readonly keys: readonly SourceAppConfigKey[];
}
export declare const SourceAppConfigEntrySchema: z.ZodObject<{
    sourceId: z.ZodString;
    displayName: z.ZodString;
    category: z.ZodEnum<{
        sharedProvider: "sharedProvider";
        module: "module";
    }>;
    keys: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        deploymentConfigured: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export interface SourceAppConfigList {
    readonly vaultAvailable: boolean;
    readonly sources: readonly SourceAppConfigEntry[];
}
export declare const SourceAppConfigListSchema: z.ZodObject<{
    vaultAvailable: z.ZodBoolean;
    sources: z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        displayName: z.ZodString;
        category: z.ZodEnum<{
            sharedProvider: "sharedProvider";
            module: "module";
        }>;
        keys: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            deploymentConfigured: z.ZodBoolean;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
//# sourceMappingURL=source.d.ts.map