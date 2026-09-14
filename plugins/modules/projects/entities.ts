/** What a project IS: the record this module writes, and how it is searched.
 *
 * BUILD TIME ONLY — a leaf. `module/`, `ui/` and `types.ts` import nothing
 * from here.
 *
 * `create` writes name, status and created_at; `update` rewrites the
 * dictionary it read, adding updated_at and, when given, description. Every
 * key is optional because a record read back mid-edit may carry any subset.
 */
import { z } from "zod";
import { column, entity, moment, type AssertEqual } from "@magnis/declare";

import type { ProjectDetails } from "./types.ts";

export const project = entity(
  {
    id: "projects.project",
    name: "Project",
    description: "A project entity owned by the projects plugin.",
  },
  {
    name: column("name", z.string().optional()),
    status: z.string().optional(),
    description: z.string().optional(),
    created_at: moment().optional(),
    updated_at: moment().optional(),
    checklist: z
      .array(z.object({
        id: z.string(),
        text: z.string(),
        status: z.enum(["pending", "in_progress", "done", "blocked"]),
        notes: z.string().optional(),
        updated_at: z.string().optional(),
      }))
      .optional(),
  },
  { order: ["name", "asc"], title: "name", body: "description" },
) satisfies z.ZodType<ProjectDetails>;

const _projectIsTheModulesOwnType: AssertEqual<z.infer<typeof project>, ProjectDetails> = true;
void _projectIsTheModulesOwnType;
