import { FileUploadParamsSchema, FileUploadResultSchema } from "../../core/file.js";
import { defineRpcContract } from "../contract.js";
export const fileContracts = {
    "file.upload": defineRpcContract({
        method: "file.upload",
        input: FileUploadParamsSchema,
        output: FileUploadResultSchema,
    }),
};
