import { z } from "zod";
/** `file.repair`: one bounded pass over the files that still name a path on disk. */
export declare const FileRepairParamsSchema: z.ZodObject<{
    limit: z.ZodInt;
}, z.core.$strict>;
export type FileRepairParams = z.output<typeof FileRepairParamsSchema>;
/** A repaired file leaves the set, so `remaining` shrinks to 0. */
export declare const FileRepairAnswerSchema: z.ZodObject<{
    repaired: z.ZodInt;
    remaining: z.ZodInt;
}, z.core.$strict>;
export type FileRepairAnswer = z.output<typeof FileRepairAnswerSchema>;
export declare const fileContracts: {
    readonly "file.upload": import("../contract.js").RpcContract<"file.upload", z.ZodObject<{
        name: z.ZodString;
        localPath: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        schemaId: z.ZodString;
        name: z.ZodString;
        mimeType: z.ZodString;
        sizeBytes: z.ZodNumber;
    }, z.core.$strict>, "required">;
    readonly "file.repair": import("../contract.js").RpcContract<"file.repair", z.ZodObject<{
        limit: z.ZodInt;
    }, z.core.$strict>, z.ZodObject<{
        repaired: z.ZodInt;
        remaining: z.ZodInt;
    }, z.core.$strict>, "required">;
};
//# sourceMappingURL=file.d.ts.map