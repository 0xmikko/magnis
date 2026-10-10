import { z } from "zod";
import { ExtensionListResultSchema, ExtensionViewSchema } from "../../core/extension.js";
import { defineRpcContract } from "../contract.js";
export const extensionsContracts = {
    "extensions.get": defineRpcContract({
        method: "extensions.get",
        input: z.object({ key: z.string().min(1) }),
        output: ExtensionViewSchema,
    }),
    "extensions.list": defineRpcContract({
        method: "extensions.list",
        input: z.object({ kind: z.enum(["module", "source", "skill"]).optional(), enabled: z.boolean().optional() }),
        output: ExtensionListResultSchema,
    }),
};
