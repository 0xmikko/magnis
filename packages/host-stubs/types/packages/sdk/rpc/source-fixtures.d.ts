import { z } from "zod";
/** Explicit test-composition contract. Production rpcContracts deliberately
 * do not include it. */
export declare const sourceFixtureProvisionContract: import("./contract.js").RpcContract<"source.fixtures.provision", z.ZodObject<{
    sourceId: z.ZodString;
    fixtureId: z.ZodString;
    identityKey: z.ZodString;
    identityLabel: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<true>;
    accountId: z.ZodString;
    generation: z.ZodNumber;
}, z.core.$strict>, "required">;
//# sourceMappingURL=source-fixtures.d.ts.map