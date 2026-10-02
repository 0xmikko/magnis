import { z } from "zod";
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
    }, z.core.$strip>, "required">;
};
//# sourceMappingURL=file.d.ts.map