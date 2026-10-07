import { z } from "zod";
import { defineHttpContract } from "./contract.js";
/** A live backend answers 200 with this; an unavailable one answers 503. */
export const healthContract = defineHttpContract({
    method: "GET",
    path: "/health",
    input: z.object({}),
    output: z.strictObject({ service: z.literal("magnis-core"), status: z.literal("ok") }),
});
