import { z } from "zod";
import { FileUploadParamsSchema, FileUploadResultSchema } from "../../core/file.js";
import { defineRpcContract } from "../contract.js";
/** `file.repair`: one bounded pass over the files that still name a path on disk. */
export const FileRepairParamsSchema = z.strictObject({
    limit: z.int().min(1).max(100),
});
/** A repaired file leaves the set, so `remaining` shrinks to 0. */
export const FileRepairAnswerSchema = z.strictObject({
    repaired: z.int().nonnegative(),
    remaining: z.int().nonnegative(),
});
export const fileContracts = {
    "file.upload": defineRpcContract({
        method: "file.upload",
        input: FileUploadParamsSchema,
        output: FileUploadResultSchema,
    }),
    "file.repair": defineRpcContract({
        method: "file.repair",
        input: FileRepairParamsSchema,
        output: FileRepairAnswerSchema,
    }),
};
