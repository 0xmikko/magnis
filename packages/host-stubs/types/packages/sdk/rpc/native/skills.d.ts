import { z } from "zod";
export declare const skillListContract: import("../contract.js").RpcContract<"skills.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
}, z.core.$strip>>, "required">;
export declare const skillReadContract: import("../contract.js").RpcContract<"skills.read", z.ZodObject<{
    id: z.ZodString;
    path: z.ZodDefault<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    content: z.ZodString;
    truncated: z.ZodBoolean;
}, z.core.$strip>, "required">;
export declare const skillListFilesContract: import("../contract.js").RpcContract<"skills.list_files", z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    files: z.ZodArray<z.ZodString>;
}, z.core.$strip>, "required">;
//# sourceMappingURL=skills.d.ts.map