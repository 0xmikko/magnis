/** What contacts' two entities ARE: the curated hub record, the Google replica,
 * and how each is searched.
 *
 * BUILD TIME ONLY — a leaf. `module/`, `ui/` and `types.ts` import nothing
 * from here.
 *
 * The hub declares what the hub OWNS. Profile facts live on the replicas it
 * reaches over `identity`, and emails are identity edges to shared address
 * nodes — a hub field for either would silently match curated contacts only.
 */
import { z } from "zod";
import { column, entity, type AssertEqual } from "@magnis/declare";

import type { GoogleContactRecord, PersonDetails } from "./types.ts";

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

export const googleContact = entity(
  {
    id: "contacts.google_contact",
    name: "Google contact",
    description:
      "The Google People replica: fields as last synced, one node one writer (plan §5). The hub composes the card from it at read time; the source never writes the hub.",
    roles: ["identity_channel"],
  },
  {
    resource_name: z.string().optional(),
    etag: z.string().optional(),
    display_name: column("name", z.string().optional()),
    given_name: z.string().optional(),
    family_name: z.string().optional(),
    emails: z
      .array(z.object({
        address: z.string().optional(),
        label: z.string().nullish(),
        is_primary: z.boolean().optional(),
      }))
      .optional(),
    phones: z
      .array(z.object({
        number: z.string().optional(),
        label: z.string().nullish(),
        is_primary: z.boolean().optional(),
      }))
      .optional(),
    organizations: z
      .array(z.object({
        name: z.string().nullish(),
        title: z.string().nullish(),
        is_current: z.boolean().optional(),
      }))
      .optional(),
    photo_url: z.string().optional(),
    external_url: z.string().optional(),
  },
  { order: ["display_name", "asc"], title: "display_name" },
) satisfies z.ZodType<GoogleContactRecord>;

const _replicaIsTheModulesOwnType: AssertEqual<z.infer<typeof googleContact>, GoogleContactRecord> = true;
void _replicaIsTheModulesOwnType;
