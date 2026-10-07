import { z } from "zod";
import { FileUploadHttpResultSchema } from "../core/file.js";
import { defineHttpContract } from "./contract.js";
export const fileUploadContract = defineHttpContract({
    method: "POST",
    path: "/files/upload",
    requestKind: "multipart",
    input: z.object({}),
    output: FileUploadHttpResultSchema,
});
