/** What the address book's one entity IS: the card, and how it is searched.
 *
 * BUILD TIME ONLY — a leaf. `module/` and `types.ts` import nothing from here.
 *
 * A card answers only for what its provider says; the person it belongs to
 * reaches it over `identity` and composes its own card from it at read time.
 */
import { z } from "zod";
import { column, entity, type AssertEqual } from "@magnis/declare";

import type { CardRecord } from "./types.ts";

export const card = entity(
  {
    id: "addressbook.card",
    name: "Address book card",
    description:
      "One contact of a provider's address book (Google's today): fields as last synced, one node one writer. The person reaches it over identity and composes its card from it at read time; the sync never writes the person.",
    roles: ["identity_channel"],
  },
  {
    source_id: z.string().optional(),
    account_id: z.string().optional(),
    sync_pass: z.string().optional(),
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
) satisfies z.ZodType<CardRecord>;

const _cardIsTheModulesOwnType: AssertEqual<z.infer<typeof card>, CardRecord> = true;
void _cardIsTheModulesOwnType;
