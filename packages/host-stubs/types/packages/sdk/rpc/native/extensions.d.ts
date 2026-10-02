import { z } from "zod";
export declare const extensionsContracts: {
    readonly "extensions.get": import("../contract.js").RpcContract<"extensions.get", z.ZodObject<{
        key: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
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
            active: "active";
            available: "available";
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
    }, z.core.$strip>, "required">;
    readonly "extensions.list": import("../contract.js").RpcContract<"extensions.list", z.ZodObject<{
        kind: z.ZodOptional<z.ZodEnum<{
            source: "source";
            module: "module";
            skill: "skill";
        }>>;
        enabled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>, z.ZodObject<{
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
                active: "active";
                available: "available";
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
    }, z.core.$strip>, "required">;
};
//# sourceMappingURL=extensions.d.ts.map