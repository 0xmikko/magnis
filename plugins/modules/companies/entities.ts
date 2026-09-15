/** What a company IS: the curated dictionary this module writes, and how it is
 * searched.
 *
 * BUILD TIME ONLY — a leaf. `module/`, `ui/` and `types.ts` import nothing
 * from here.
 *
 * The name is written into the dictionary AND carried by the entity row;
 * search takes the row's copy, which every entity has, while the graph still
 * accepts the key the module writes.
 */
import { z } from "zod";
import { column, entity, type AssertEqual } from "@magnis/declare";

import type { CompanyDetailsFacet } from "./types.ts";

export const company = entity(
  {
    id: "companies.company",
    name: "Company",
    description: "A company / organisation entity owned by the companies plugin.",
    roles: ["hub"],
    mergeable: true,
  },
  {
    name: column("name", z.string().nullish()),
    phones: z
      .array(z.object({ phone: z.string(), type: z.string().nullable(), is_primary: z.boolean() }))
      .optional(),
    description: z.string().nullish(),
    industry: z.string().nullish(),
    domain: z.string().nullish(),
    website: z.string().nullish(),
    location: z.string().nullish(),
    size: z.string().nullish(),
    founded: z.string().nullish(),
    stage: z.string().nullish(),
    headcount: z.number().nullish(),
    funding_total: z.string().nullish(),
  },
  { order: ["name", "asc"], title: "name", body: "description" },
) satisfies z.ZodType<CompanyDetailsFacet>;

const _companyIsTheModulesOwnType: AssertEqual<z.infer<typeof company>, CompanyDetailsFacet> = true;
void _companyIsTheModulesOwnType;
