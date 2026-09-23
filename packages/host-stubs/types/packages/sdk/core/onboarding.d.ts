import { z } from "zod";
export declare const onboardingKinds: readonly ["demo", "full"];
export declare const OnboardingKindSchema: z.ZodEnum<{
    demo: "demo";
    full: "full";
}>;
export type OnboardingKind = z.output<typeof OnboardingKindSchema>;
export declare const OnboardingProfileSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        demo: "demo";
        full: "full";
    }>;
    completedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type OnboardingProfile = z.output<typeof OnboardingProfileSchema>;
//# sourceMappingURL=onboarding.d.ts.map