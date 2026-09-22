import { z } from "zod";
export declare const extensionKinds: readonly ["module", "source", "skill"];
export declare const ExtensionKindSchema: z.ZodEnum<{
    source: "source";
    module: "module";
    skill: "skill";
}>;
export type ExtensionKind = z.output<typeof ExtensionKindSchema>;
export declare const extensionLifecycleStates: readonly ["available", "installed_disabled", "active", "activation_failed"];
export declare const ExtensionLifecycleStateSchema: z.ZodEnum<{
    available: "available";
    active: "active";
    installed_disabled: "installed_disabled";
    activation_failed: "activation_failed";
}>;
export type ExtensionLifecycleState = z.output<typeof ExtensionLifecycleStateSchema>;
export declare const ExtensionUiDescriptorSchema: z.ZodObject<{
    moduleId: z.ZodString;
    packageHash: z.ZodString;
    entry: z.ZodString;
    exportName: z.ZodString;
}, z.core.$strip>;
export type ExtensionUiDescriptor = z.output<typeof ExtensionUiDescriptorSchema>;
export declare const ExtensionViewSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        module: "module";
        skill: "skill";
    }>;
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    publisher: z.ZodString;
    publisherUrl: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodString;
    details: z.ZodString;
    docsUrl: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    state: z.ZodEnum<{
        available: "available";
        active: "active";
        installed_disabled: "installed_disabled";
        activation_failed: "activation_failed";
    }>;
    stateReason: z.ZodOptional<z.ZodString>;
    connection: z.ZodOptional<z.ZodString>;
    installable: z.ZodBoolean;
    installed: z.ZodBoolean;
    enabled: z.ZodBoolean;
    packageHash: z.ZodNullable<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        moduleId: z.ZodString;
        packageHash: z.ZodString;
        entry: z.ZodString;
        exportName: z.ZodString;
    }, z.core.$strip>>;
    removable: z.ZodBoolean;
    position: z.ZodNumber;
    blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type ExtensionView = z.output<typeof ExtensionViewSchema>;
export declare const ExtensionListResultSchema: z.ZodObject<{
    extensions: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            source: "source";
            module: "module";
            skill: "skill";
        }>;
        id: z.ZodString;
        title: z.ZodString;
        summary: z.ZodString;
        publisher: z.ZodString;
        publisherUrl: z.ZodOptional<z.ZodString>;
        iconUrl: z.ZodString;
        details: z.ZodString;
        docsUrl: z.ZodOptional<z.ZodString>;
        version: z.ZodString;
        state: z.ZodEnum<{
            available: "available";
            active: "active";
            installed_disabled: "installed_disabled";
            activation_failed: "activation_failed";
        }>;
        stateReason: z.ZodOptional<z.ZodString>;
        connection: z.ZodOptional<z.ZodString>;
        installable: z.ZodBoolean;
        installed: z.ZodBoolean;
        enabled: z.ZodBoolean;
        packageHash: z.ZodNullable<z.ZodString>;
        ui: z.ZodOptional<z.ZodObject<{
            moduleId: z.ZodString;
            packageHash: z.ZodString;
            entry: z.ZodString;
            exportName: z.ZodString;
        }, z.core.$strip>>;
        removable: z.ZodBoolean;
        position: z.ZodNumber;
        blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
        unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
        surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ExtensionListResult = z.output<typeof ExtensionListResultSchema>;
export declare const ExtensionCatalogRefreshResultSchema: z.ZodUnion<readonly [z.ZodObject<{
    available: z.ZodLiteral<true>;
    packages: z.ZodNumber;
    channel: z.ZodString;
    curation: z.ZodNullable<z.ZodUnknown>;
}, z.core.$strip>, z.ZodObject<{
    available: z.ZodLiteral<false>;
    reason: z.ZodString;
}, z.core.$strip>]>;
export type ExtensionCatalogRefreshResult = z.output<typeof ExtensionCatalogRefreshResultSchema>;
export declare const MagnisApiVersionSchema: z.ZodString;
export type MagnisApiVersion = z.output<typeof MagnisApiVersionSchema>;
//# sourceMappingURL=extension.d.ts.map