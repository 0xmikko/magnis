import type { Questions, ResultFor } from "@typesafe-ai/sdk";
import { z } from "zod";
import type { AiCallAccounting } from "./ai-model.js";
import type { JsonObject, JsonValue } from "./json.js";
export { noul, choice, score } from "@typesafe-ai/sdk";
export type { Question, Questions, ResultFor, SystemOneRequest, SystemOneResult, } from "@typesafe-ai/sdk";
export type { DecisionModelInfo } from "./ai-model.js";
export interface DecisionRequest<Q extends Questions = Questions> {
    readonly state: string | JsonObject | JsonValue[];
    readonly questions: Q;
}
export interface DecisionResult<Q extends Questions = Questions> {
    readonly resolvedModelId: string;
    readonly answers: {
        readonly [K in keyof Q]: ResultFor<Q[K]> | {
            readonly type: "refusal";
        };
    };
    readonly accounting: AiCallAccounting;
}
/** Magnis admission is narrower than the upstream optional/JSON instructions. */
export declare const DecisionRequestSchema: z.ZodObject<{
    state: z.ZodUnion<readonly [z.ZodString, z.ZodType<JsonObject, unknown, z.core.$ZodTypeInternals<JsonObject, unknown>>, z.ZodArray<z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>>]>;
    questions: z.ZodRecord<z.ZodString, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"noul">;
        instructions: z.ZodString;
        criteria: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            true: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            false: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"choice">;
        instructions: z.ZodString;
        criteria: z.ZodRecord<z.ZodString, z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"score">;
        instructions: z.ZodString;
        criteria: z.ZodTuple<[z.ZodString, z.ZodString], z.ZodString>;
    }, z.core.$strict>], "type">>;
}, z.core.$strict>;
/** Own the admitted snapshot before resolving credentials or contacting a provider. */
export declare function snapshotDecisionRequest<const Q extends Questions>(request: DecisionRequest<Q>): DecisionRequest<Q>;
/** Decode unknown provider answers without asserting a vendor result or repairing it. */
export declare function parseDecisionAnswers<const Q extends Questions>(value: unknown, supplied: Q): DecisionResult<Q>["answers"];
//# sourceMappingURL=decision-model.d.ts.map