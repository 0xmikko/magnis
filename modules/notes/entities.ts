/** What a note IS: the record this module writes, and how it is searched.
 *
 * BUILD TIME ONLY — a leaf. `module/`, `ui/` and `types.ts` import nothing
 * from here.
 *
 * The note's state is the node's dictionary, written whole on every save:
 * `writeContent` sets all four keys at once, so all four are declared and none
 * is optional in practice — the optionality below is the reader's, since a
 * record read back before a save has none of them.
 */
import { z } from "zod";
import { column, entity, moment, type AssertEqual } from "@magnis/declare";

import type { ContentData } from "./types.ts";

export const note = entity(
  {
    id: "notes.note",
    name: "Note",
    description: "A markdown note entity owned by the notes plugin.",
  },
  {
    title: column("name", z.string().optional()),
    body: z.string().optional(),
    pinned: z.boolean().optional(),
    updated_at: moment().optional(),
  },
  { order: ["updated_at", "desc"], title: "title", body: "body" },
) satisfies z.ZodType<ContentData>;

const _noteIsTheModulesOwnType: AssertEqual<z.infer<typeof note>, ContentData> = true;
void _noteIsTheModulesOwnType;
