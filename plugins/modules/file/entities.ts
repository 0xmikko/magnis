/** What a file IS: the record the core FileService writes, and how it is
 * searched.
 *
 * BUILD TIME ONLY — a leaf. `module/`, `ui/` and `types.ts` import nothing
 * from here.
 *
 * This module is the ONLY one that does not write its own entity: the storage
 * engine does, and this plugin owns the schema and the read surface. The
 * declaration is therefore a contract ACROSS the two, and the type it pins to
 * is the one this module's own readers use.
 */
import { z } from "zod";
import { entity, type AssertEqual } from "@magnis/declare";

import type { FileDetails } from "./types.ts";

export const object = entity(
  {
    id: "file.object",
    name: "File",
    description:
      "File or media attachment entity. Written by core FileService (storage engine); this plugin owns the schema + the read/manage surface.",
    roles: ["file_object"],
  },
  {
    name: z.string().nullish(),
    mime_type: z.string(),
    size_bytes: z.number().nullish(),
    local_path: z.string().nullish(),
    cloud_url: z.string().nullish(),
    source_module: z.string(),
    source_surface: z.string().optional(),
    /** Whatever the source needs to fetch the bytes again — opaque here. */
    source_ref: z.looseObject({}),
    image: z.object({ width: z.number(), height: z.number() }).optional(),
    audio: z.object({ duration_seconds: z.number() }).optional(),
    video: z
      .object({ duration_seconds: z.number(), width: z.number(), height: z.number() })
      .optional(),
  },
  { order: ["name", "asc"], title: "name" },
) satisfies z.ZodType<FileDetails>;

const _fileIsTheModulesOwnType: AssertEqual<z.infer<typeof object>, FileDetails> = true;
void _fileIsTheModulesOwnType;
