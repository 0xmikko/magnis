import { z } from "zod";
import { EntityCapabilitiesSchema } from "../../core/plugin.js";
import { SkillInfoSchema, SkillListFilesParamsSchema, SkillListFilesResultSchema, SkillReadParamsSchema, SkillReadResultSchema, } from "../../core/skill.js";
import { defineRpcContract } from "../contract.js";
export const skillListContract = defineRpcContract({
    method: "skills.list",
    input: z.object({}),
    output: z.array(SkillInfoSchema),
});
export const skillReadContract = defineRpcContract({
    method: "skills.read",
    input: SkillReadParamsSchema,
    output: SkillReadResultSchema,
});
export const skillListFilesContract = defineRpcContract({
    method: "skills.list_files",
    input: SkillListFilesParamsSchema,
    output: SkillListFilesResultSchema,
});
export const skillsContracts = {
    "skills.capabilities": defineRpcContract({
        method: "skills.capabilities",
        input: z.object({}),
        output: EntityCapabilitiesSchema,
    }),
    "skills.list": skillListContract,
    "skills.list_files": skillListFilesContract,
    "skills.read": skillReadContract,
    // Bound operation names retain the existing client adapters for equivalent methods.
    "skills.skill.list": { ...skillListContract, method: "skills.skill.list" },
    "skills.skill.get": { ...skillReadContract, method: "skills.skill.get" },
    "skills.skill.file.list": { ...skillListFilesContract, method: "skills.skill.file.list" },
};
