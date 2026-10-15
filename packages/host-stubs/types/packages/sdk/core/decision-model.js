import { z } from "zod";
import { JsonObjectSchema, JsonValueSchema } from "./json.js";
export { noul, choice, score } from "@typesafe-ai/sdk";
const text = z.string().refine((value) => value.trim().length > 0, "Text must not be blank");
const questions = z.record(text, z.discriminatedUnion("type", [
    z.strictObject({
        type: z.literal("noul"),
        instructions: text,
        criteria: z.strictObject({ true: text.nullable().optional(), false: text.nullable().optional() }).nullable().optional(),
    }),
    z.strictObject({
        type: z.literal("choice"),
        instructions: text,
        criteria: z.record(text, z.string().nullable()).refine((value) => {
            const count = Object.keys(value).length;
            return count >= 2 && count <= 255;
        }, "Choice requires between two and 255 criteria"),
    }),
    z.strictObject({
        type: z.literal("score"),
        instructions: text,
        criteria: z.tuple([text, text]).rest(text).refine((value) => value.length <= 10, "Score supports at most ten criteria"),
    }),
])).refine((value) => Object.keys(value).length > 0, "Questions must not be empty");
/** Magnis admission is narrower than the upstream optional/JSON instructions. */
export const DecisionRequestSchema = z.strictObject({
    state: z.union([text, JsonObjectSchema, z.array(JsonValueSchema)]),
    questions,
});
/** Own the admitted snapshot before resolving credentials or contacting a provider. */
export function snapshotDecisionRequest(request) {
    const snapshot = structuredClone(request);
    DecisionRequestSchema.parse(snapshot);
    return snapshot;
}
function object(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function exactKeys(value, keys) {
    const actual = Object.keys(value);
    return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function probability(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
function distribution(value, keys) {
    if (!object(value) || !exactKeys(value, keys))
        return false;
    let total = 0;
    for (const key of keys) {
        const item = value[key];
        if (!probability(item))
            return false;
        total += item;
    }
    return Math.abs(total - 1) <= 1e-6;
}
/** Each predicate below establishes the upstream answer relation to its question. */
function answersMatch(value, supplied) {
    if (!object(value) || !exactKeys(value, Object.keys(supplied)))
        return false;
    for (const [name, question] of Object.entries(supplied)) {
        const answer = value[name];
        if (!object(answer))
            return false;
        if (answer.type === "refusal") {
            if (!exactKeys(answer, ["type"]))
                return false;
            continue;
        }
        if (answer.type !== question.type)
            return false;
        switch (question.type) {
            case "noul":
                if (!exactKeys(answer, ["type", "noul"]) || !probability(answer.noul))
                    return false;
                break;
            case "choice": {
                const labels = Object.keys(question.criteria);
                if (!exactKeys(answer, ["type", "choice", "confidence", "probabilities"])
                    || typeof answer.choice !== "string" || !labels.includes(answer.choice)
                    || !probability(answer.confidence) || !distribution(answer.probabilities, labels))
                    return false;
                break;
            }
            case "score": {
                const indices = question.criteria.map((_criterion, index) => String(index));
                if (!exactKeys(answer, ["type", "score", "confidence", "probabilities", "legend"])
                    || typeof answer.score !== "number" || !Number.isFinite(answer.score)
                    || answer.score < 0 || answer.score > question.criteria.length - 1
                    || !probability(answer.confidence) || !distribution(answer.probabilities, indices)
                    || !object(answer.legend) || !exactKeys(answer.legend, indices))
                    return false;
                let expected = 0;
                for (let index = 0; index < question.criteria.length; index += 1) {
                    const criterion = question.criteria[index];
                    const key = String(index);
                    if (answer.legend[key] !== criterion)
                        return false;
                    const weight = answer.probabilities[key];
                    if (weight === undefined)
                        return false;
                    expected += index * weight;
                }
                if (Math.abs(answer.score - expected) > 1e-6)
                    return false;
                break;
            }
            default: {
                const unsupported = question;
                void unsupported;
                return false;
            }
        }
    }
    return true;
}
/** Decode unknown provider answers without asserting a vendor result or repairing it. */
export function parseDecisionAnswers(value, supplied) {
    questions.parse(supplied);
    if (!answersMatch(value, supplied)) {
        throw new TypeError("Decision answers do not match the supplied questions");
    }
    return structuredClone(value);
}
