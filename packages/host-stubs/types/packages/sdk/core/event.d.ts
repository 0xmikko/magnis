import { z } from "zod";
export interface WorkspaceIndexProgressEvent {
    readonly type: "app.indexProgress";
    readonly indexed: number;
    readonly total: number;
}
export declare const WorkspaceIndexProgressEventSchema: z.ZodObject<{
    type: z.ZodLiteral<"app.indexProgress">;
    indexed: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strict>;
//# sourceMappingURL=event.d.ts.map