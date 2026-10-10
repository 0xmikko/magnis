import { z } from "zod";
import { ModuleSettingsEntrySchema } from "../../core/module-settings.js";
import { defineRpcContract } from "../contract.js";
export const moduleSettingsContracts = {
    "module_settings.list": defineRpcContract({
        method: "module_settings.list",
        input: z.object({ moduleId: z.string().optional() }),
        output: z.array(ModuleSettingsEntrySchema),
    }),
};
