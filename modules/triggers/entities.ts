/** What a trigger IS: the config this module writes as the node's dictionary,
 * and how it is searched.
 *
 * BUILD TIME ONLY — a leaf. `module/`, `ui/` and `types.ts` import nothing
 * from here.
 *
 * The schedule is a nested object: the graph enforces its shape, and search
 * indexes no field inside it, because the query language has no word for
 * reaching in.
 */
import { z } from "zod";
import { entity, moment, type AssertEqual } from "@magnis/declare";

import type { TriggerConfigData } from "./types.ts";

export const trigger = entity(
  {
    id: "triggers.trigger",
    name: "Trigger",
    description:
      "An automation trigger entity. Its definition CRUD is owned by the triggers plugin; the native engine reads it to evaluate + fire.",
  },
  {
    name: z.string(),
    gate_prompt: z.string(),
    action_prompt: z.string(),
    status: z.enum(["active", "stopped", "paused", "disabled", "expired"]),
    event_kinds: z.array(z.string()),
    schema_filter: z.string().optional(),
    expires_at: moment().optional(),
    debounce_seconds: z.number(),
    max_wait_seconds: z.number().optional(),
    max_firings: z.number().optional(),
    firing_count: z.number(),
    last_fired_at: moment().optional(),
    schedule: z
      .object({ cron: z.string(), timezone: z.string(), activated_at: z.string() })
      .optional(),
  },
  { order: ["name", "asc"], title: "name", body: "action_prompt" },
) satisfies z.ZodType<TriggerConfigData>;

const _triggerIsTheModulesOwnType: AssertEqual<z.infer<typeof trigger>, TriggerConfigData> = true;
void _triggerIsTheModulesOwnType;
