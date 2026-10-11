import { z } from "zod";
import { CreditBalanceSchema } from "../../core/credit.js";
import { defineRpcContract } from "../contract.js";
export const creditBalanceGetContract = defineRpcContract({
    method: "credits.balance.get",
    input: z.object({}),
    output: CreditBalanceSchema,
});
export const creditsContracts = {
    "credits.balance.get": creditBalanceGetContract,
};
