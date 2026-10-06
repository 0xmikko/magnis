/** What contacts' entity IS: the curated hub record, and how it is searched.
 *
 * BUILD TIME ONLY — a leaf. `module/`, `ui/` and `types.ts` import nothing
 * from here.
 *
 * The hub declares what the hub OWNS. Profile facts live on the replicas it
 * reaches over `identity`, and emails are identity edges to shared address
 * nodes — a hub field for either would silently match curated contacts only.
 */
import { z } from "zod";
import { entity, type AssertEqual } from "@magnis/declare";

import type { PersonDetails } from "./types.ts";

export const person = entity(
  {
    id: "contacts.person",
    name: "Person",
    description: "A person / contact entity owned by the contacts plugin.",
    roles: ["hub"],
    mergeable: true,
  },
  {
    description: z.string().nullish(),
    role: z.string().nullish(),
    company: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    phones: z
      .array(z.object({ phone: z.string(), type: z.string().nullable(), is_primary: z.boolean() }))
      .optional(),
    tracking: z
      .array(z.object({
        platform: z.enum(["x", "linkedin"]),
        handle: z.string().nullish(),
        enabled: z.boolean(),
      }))
      .optional(),
  },
  { order: ["first_name", "asc"], title: "first_name", body: "description" },
) satisfies z.ZodType<PersonDetails>;

const _personIsTheModulesOwnType: AssertEqual<z.infer<typeof person>, PersonDetails> = true;
void _personIsTheModulesOwnType;
