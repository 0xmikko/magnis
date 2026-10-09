import { z } from "zod";
export const onboardingKinds = ["demo", "full"];
export const OnboardingKindSchema = z.enum(onboardingKinds);
export const OnboardingProfileSchema = z.strictObject({
    kind: OnboardingKindSchema,
    completedAt: z.string().nullable(),
});
