import { defineHttpContract } from "./contract.js";
import { SearchAblationContextSchema, SearchAblationPairInputSchema, SearchAblationPairResultSchema, SearchAblationPrepareInputSchema, } from "../core/search-ablation.js";
export const prepareSearchAblationContract = defineHttpContract({
    method: "POST",
    path: "/api/eval/search-ablation/prepare",
    input: SearchAblationPrepareInputSchema,
    output: SearchAblationContextSchema,
});
export const runSearchAblationPairContract = defineHttpContract({
    method: "POST",
    path: "/api/eval/search-ablation/pair",
    input: SearchAblationPairInputSchema,
    output: SearchAblationPairResultSchema,
});
export const searchAblationHttpContracts = [
    prepareSearchAblationContract,
    runSearchAblationPairContract,
];
