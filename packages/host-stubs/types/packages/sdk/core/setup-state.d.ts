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
 * `backend/src/core/setup.ts::SetupStep`. Mirrored verbatim: the interface
 * is the contract and the schema decodes into it.
 *
 * `connect` carries the Source it signs into, because a person with two
 * accounts walks two of these, one screen each. */
export interface SetupStep {
    readonly kind: "welcome" | "accounts" | "connect" | "agent" | "syncing" | "done";
    /** Present only on `connect`: the Source this screen signs into. */
    readonly source?: string;
}
/** What a step that is behind the person recorded. A skip is its own state,
 * never the absence of a record. */
export interface SetupStepOutcome {
    readonly state: "answered" | "skipped" | "refused";
    /** Present only on `refused`: the exact reason the person is shown. */
    readonly reason?: string;
}
export interface SetupStepRecord {
    readonly step: SetupStep;
    readonly outcome: SetupStepOutcome;
    /** The ceremony the server already holds for a `connect` step, so
     * re-entering it resumes instead of opening a second one. Null elsewhere.
     *
     * One word, like every field of these shapes: the contract codec rewrites
     * multi-word keys in flight, and a single word is the same on both sides
     * of it. */
    readonly session: string | null;
}
/** The ordered screens the server derived for this person. The browser
 * renders what this names and computes no sequence of its own. */
export interface SetupPlan {
    readonly steps: readonly SetupStep[];
}
/** Where the person is, and what is behind them. */
export interface SetupStage {
    /** The step to render now; null once the plan is finished. */
    readonly current: SetupStep | null;
    readonly history: readonly SetupStepRecord[];
}
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
export declare const SetupStepOutcomeSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    state: z.ZodLiteral<"answered">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"skipped">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"refused">;
    reason: z.ZodString;
}, z.core.$strict>], "state">;
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
/** What `setup.update` carries: exactly ONE step, what it recorded, the
 * ceremony session that step opened, and the document as that step leaves it
 * — null on a step that decides nothing. */
export interface SetupStepAnswer {
    readonly step: SetupStep;
    readonly outcome: SetupStepOutcome;
    readonly session: string | null;
    readonly document: SetupState | null;
}
/** What `setup.get` and `setup.update` both answer. */
export interface SetupView {
    readonly document: SetupState;
    readonly plan: SetupPlan;
    readonly stage: SetupStage;
}
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
//# sourceMappingURL=setup-state.d.ts.map