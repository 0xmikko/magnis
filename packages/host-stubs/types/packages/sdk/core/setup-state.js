import { z } from "zod";
/** The user's onboarding document, version 3, as `setup.get` and
 * `setup.update` carry it. The backend stores it under its own keys
 * (`backend/src/core/setup.ts::SetupStateSchema`) and maps it to this shape
 * where it reads and writes the row.
 *
 * This schema sits on BOTH ends of `setup.update`: the client encodes its
 * request through it and the server decodes the request through it. It is
 * strict, so a document in any other spelling is refused. */
export const setupSchemaVersion = 3;
export const SetupStateSchema = z.strictObject({
    version: z.number().int().nonnegative(),
    completed: z.boolean(),
    currentStep: z.string(),
    /** Installed Source ids this person connects: `source:magnis.telegram`.
     * The only thing a person picks — the apps their services need come with
     * them and are read from `extensions.list`. */
    sources: z.array(z.string()),
    /** This person's agent; null until chosen. */
    engine: z.string().nullable(),
});
/** One screen of a person's onboarding — the SDK half of
 * `backend/src/core/setup.ts::SetupStep`.
 *
 * `connect` carries the Source it signs into (`source`), because a person
 * with two accounts walks two of these, one screen each. */
export const SetupStepSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("welcome") }),
    z.strictObject({ kind: z.literal("accounts") }),
    z.strictObject({ kind: z.literal("connect"), source: z.string().min(1) }),
    z.strictObject({ kind: z.literal("agent") }),
    z.strictObject({ kind: z.literal("syncing") }),
    z.strictObject({ kind: z.literal("done") }),
]);
/** What a step that is behind the person recorded. A skip is its own state,
 * never the absence of a record. `reason`, only on `refused`, is the exact
 * reason the person is shown. */
export const SetupStepOutcomeSchema = z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("answered") }),
    z.strictObject({ state: z.literal("skipped") }),
    z.strictObject({ state: z.literal("refused"), reason: z.string() }),
]);
const SetupStepRecordSchema = z.strictObject({
    step: SetupStepSchema,
    outcome: SetupStepOutcomeSchema,
    /** The ceremony the server already holds for a `connect` step, so
     * re-entering it resumes instead of opening a second one. Null elsewhere. */
    session: z.string().min(1).nullable(),
});
/** The ordered screens the server derived for this person. The browser
 * renders what this names and computes no sequence of its own. */
export const SetupPlanSchema = z.strictObject({
    steps: z.array(SetupStepSchema).readonly(),
});
/** Where the person is, and what is behind them. `current` is the step to
 * render now; null once the plan is finished. */
export const SetupStageSchema = z.strictObject({
    current: SetupStepSchema.nullable(),
    history: z.array(SetupStepRecordSchema).readonly(),
});
/** What `setup.update` carries: exactly ONE step, what it recorded, the
 * ceremony session that step opened, and the document as that step leaves it
 * — null on a step that decides nothing. */
export const SetupStepAnswerSchema = z.strictObject({
    step: SetupStepSchema,
    outcome: SetupStepOutcomeSchema,
    session: z.string().min(1).nullable(),
    document: SetupStateSchema.nullable(),
});
/** What `setup.get` and `setup.update` both answer. */
export const SetupViewSchema = z.strictObject({
    document: SetupStateSchema,
    plan: SetupPlanSchema,
    stage: SetupStageSchema,
});
