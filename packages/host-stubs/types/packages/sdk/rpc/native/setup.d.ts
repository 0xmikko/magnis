import { z } from "zod";
export declare const setupContracts: {
    readonly "setup.get": import("../contract.js").RpcContract<"setup.get", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        document: z.ZodObject<{
            version: z.ZodNumber;
            completed: z.ZodBoolean;
            currentStep: z.ZodString;
            sources: z.ZodArray<z.ZodString>;
            engine: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>;
        plan: z.ZodObject<{
            steps: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"welcome">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"accounts">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"connect">;
                source: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"agent">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"syncing">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"done">;
            }, z.core.$strict>], "kind">>>;
        }, z.core.$strict>;
        stage: z.ZodObject<{
            current: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"welcome">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"accounts">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"connect">;
                source: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"agent">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"syncing">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"done">;
            }, z.core.$strict>], "kind">>;
            history: z.ZodReadonly<z.ZodArray<z.ZodObject<{
                step: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    kind: z.ZodLiteral<"welcome">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"accounts">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"connect">;
                    source: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"agent">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"syncing">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"done">;
                }, z.core.$strict>], "kind">;
                outcome: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    state: z.ZodLiteral<"answered">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"skipped">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"refused">;
                    reason: z.ZodString;
                }, z.core.$strict>], "state">;
                session: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>;
    }, z.core.$strict>, "required">;
    readonly "setup.update": import("../contract.js").RpcContract<"setup.update", z.ZodObject<{
        step: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"welcome">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"accounts">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"connect">;
            source: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"agent">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"syncing">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"done">;
        }, z.core.$strict>], "kind">;
        outcome: z.ZodDiscriminatedUnion<[z.ZodObject<{
            state: z.ZodLiteral<"answered">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"skipped">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"refused">;
            reason: z.ZodString;
        }, z.core.$strict>], "state">;
        session: z.ZodNullable<z.ZodString>;
        document: z.ZodNullable<z.ZodObject<{
            version: z.ZodNumber;
            completed: z.ZodBoolean;
            currentStep: z.ZodString;
            sources: z.ZodArray<z.ZodString>;
            engine: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>, z.ZodObject<{
        document: z.ZodObject<{
            version: z.ZodNumber;
            completed: z.ZodBoolean;
            currentStep: z.ZodString;
            sources: z.ZodArray<z.ZodString>;
            engine: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>;
        plan: z.ZodObject<{
            steps: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"welcome">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"accounts">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"connect">;
                source: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"agent">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"syncing">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"done">;
            }, z.core.$strict>], "kind">>>;
        }, z.core.$strict>;
        stage: z.ZodObject<{
            current: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"welcome">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"accounts">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"connect">;
                source: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"agent">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"syncing">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"done">;
            }, z.core.$strict>], "kind">>;
            history: z.ZodReadonly<z.ZodArray<z.ZodObject<{
                step: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    kind: z.ZodLiteral<"welcome">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"accounts">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"connect">;
                    source: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"agent">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"syncing">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"done">;
                }, z.core.$strict>], "kind">;
                outcome: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    state: z.ZodLiteral<"answered">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"skipped">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"refused">;
                    reason: z.ZodString;
                }, z.core.$strict>], "state">;
                session: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>;
    }, z.core.$strict>, "required">;
};
//# sourceMappingURL=setup.d.ts.map