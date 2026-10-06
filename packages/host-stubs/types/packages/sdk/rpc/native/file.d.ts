export declare const fileContracts: {
    readonly "file.upload": import("../contract.js").RpcContract<"file.upload", import("zod").ZodObject<{
        name: import("zod").ZodString;
        localPath: import("zod").ZodString;
        mimeType: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        schemaId: import("zod").ZodString;
        name: import("zod").ZodString;
        mimeType: import("zod").ZodString;
        sizeBytes: import("zod").ZodNumber;
    }, import("zod/v4/core").$strict>, "required">;
};
//# sourceMappingURL=file.d.ts.map