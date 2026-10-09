import { z } from "zod";
export const SkillInfoSchema = z.strictObject({
    id: z.string(),
    name: z.string(),
    description: z.string(),
});
export const SkillReadParamsSchema = z.object({
    id: z.string().min(1),
    path: z.string().default("SKILL.md"),
});
export const SkillReadResultSchema = z.strictObject({
    content: z.string(),
    truncated: z.boolean(),
});
export const SkillListFilesParamsSchema = z.object({ id: z.string().min(1) });
export const SkillListFilesResultSchema = z.strictObject({ files: z.array(z.string()) });
