import { z } from "zod";
export declare const OkAckSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
}, z.core.$strip>;
export type OkAck = z.output<typeof OkAckSchema>;
export declare const StatusAckSchema: z.ZodObject<{
    status: z.ZodString;
}, z.core.$strip>;
export type StatusAck = z.output<typeof StatusAckSchema>;
//# sourceMappingURL=rpc-response.d.ts.map