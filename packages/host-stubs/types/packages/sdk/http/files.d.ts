import { z } from "zod";
export declare const fileUploadContract: import("./contract.js").HttpContract<"POST", "/files/upload", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    entityId: z.ZodString;
    name: z.ZodString;
    mimeType: z.ZodString;
    sizeBytes: z.ZodNumber;
    url: z.ZodString;
}, z.core.$strip>>;
//# sourceMappingURL=files.d.ts.map