import { z } from "zod";
/** Durable working-memory summary returned by episodes.summary.*. */
export const EpisodeSummarySchema = z.object({
    id: z.string(),
    episodeId: z.string(),
    objective: z.string().nullable(),
    currentState: z.string().nullable(),
    recentDecisions: z.array(z.string()),
    entityRefs: z.array(z.string()),
    tokenEstimate: z.number().int().nonnegative(),
    lastRefreshedAt: z.string(),
    createdAt: z.string(),
}).strict();
