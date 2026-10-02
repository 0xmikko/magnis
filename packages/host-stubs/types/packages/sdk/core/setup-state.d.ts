import { z } from "zod";
/** The user's onboarding document, version 3 — the SDK half of
 * `backend/src/core/setup.ts::SetupState`, in the SDK's camel-case
 * spelling (`nativeWireCodec` maps `current_step` on the wire).
 *
 * This schema sits on BOTH ends of `setup.update`: the client encodes its
 * request through it and the server decodes the request through it before
 * its own decoder sees the document. A key it does not name is stripped in
 * flight, so it must name exactly what the backend's document holds. */
export declare const setupSchemaVersion = 3;
export declare const SetupStateSchema: z.ZodObject<{
    version: z.ZodNumber;
    completed: z.ZodBoolean;
    currentStep: z.ZodString;
    sources: z.ZodArray<z.ZodString>;
    engine: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type SetupState = z.output<typeof SetupStateSchema>;
/** One screen of a person's onboarding — the SDK half of
 * `backend/src/core/setup.ts::SetupStep`.
 *
 * `connect` carries the Source it signs into (`source`), because a person
 * with two accounts walks two of these, one screen each. */
export declare const SetupStepSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
export type SetupStep = z.output<typeof SetupStepSchema>;
/** What a step that is behind the person recorded. A skip is its own state,
 * never the absence of a record. `reason`, only on `refused`, is the exact
 * reason the person is shown. */
export declare const SetupStepOutcomeSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    state: z.ZodLiteral<"answered">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"skipped">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"refused">;
    reason: z.ZodString;
}, z.core.$strict>], "state">;
export type SetupStepOutcome = z.output<typeof SetupStepOutcomeSchema>;
declare const SetupStepRecordSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type SetupStepRecord = z.output<typeof SetupStepRecordSchema>;
/** The ordered screens the server derived for this person. The browser
 * renders what this names and computes no sequence of its own. */
export declare const SetupPlanSchema: z.ZodObject<{
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
export type SetupPlan = z.output<typeof SetupPlanSchema>;
/** Where the person is, and what is behind them. `current` is the step to
 * render now; null once the plan is finished. */
export declare const SetupStageSchema: z.ZodObject<{
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
export type SetupStage = z.output<typeof SetupStageSchema>;
/** What `setup.update` carries: exactly ONE step, what it recorded, the
 * ceremony session that step opened, and the document as that step leaves it
 * — null on a step that decides nothing. */
export declare const SetupStepAnswerSchema: z.ZodObject<{
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
    }, z.core.$strip>>;
}, z.core.$strict>;
export type SetupStepAnswer = z.output<typeof SetupStepAnswerSchema>;
/** What `setup.get` and `setup.update` both answer. */
export declare const SetupViewSchema: z.ZodObject<{
    document: z.ZodObject<{
        version: z.ZodNumber;
        completed: z.ZodBoolean;
        currentStep: z.ZodString;
        sources: z.ZodArray<z.ZodString>;
        engine: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
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
}, z.core.$strict>;
export type SetupView = z.output<typeof SetupViewSchema>;
export {};
//# sourceMappingURL=setup-state.d.ts.map