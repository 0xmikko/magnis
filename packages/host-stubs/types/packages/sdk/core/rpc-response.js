import { z } from "zod";
export const OkAckSchema = z.strictObject({ ok: z.literal(true) });
export const StatusAckSchema = z.strictObject({ status: z.string() });
