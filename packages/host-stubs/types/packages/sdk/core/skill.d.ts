import { z } from "zod";
export declare const SkillInfoSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
}, z.core.$strip>;
export type SkillInfo = z.output<typeof SkillInfoSchema>;
export declare const SkillReadParamsSchema: z.ZodObject<{
    id: z.ZodString;
    path: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type SkillReadParams = z.input<typeof SkillReadParamsSchema>;
export declare const SkillReadResultSchema: z.ZodObject<{
    content: z.ZodString;
    truncated: z.ZodBoolean;
}, z.core.$strip>;
export type SkillReadResult = z.output<typeof SkillReadResultSchema>;
export declare const SkillListFilesParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type SkillListFilesParams = z.input<typeof SkillListFilesParamsSchema>;
export declare const SkillListFilesResultSchema: z.ZodObject<{
    files: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type SkillListFilesResult = z.output<typeof SkillListFilesResultSchema>;
//# sourceMappingURL=skill.d.ts.map