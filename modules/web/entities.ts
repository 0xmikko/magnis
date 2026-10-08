/** What web's two entities ARE: a link, one URL of one user, and a page, one
 * content that URL served, and how each is searched.
 *
 * BUILD TIME ONLY — a leaf. `module/` and `types.ts` import nothing from here.
 *
 * Neither declares a title or a body for the semantic index: Web content is
 * found by URL, domain, title and date, and a page's text lives in the byte
 * store, which no index reads.
 */
import { z } from "zod";
import { column, entity, moment, type AssertEqual } from "@magnis/declare";

import type { WebLinkDetails, WebPageDetails } from "./types.ts";

/** One object type for an intersection, so `AssertEqual` compares the keys
 * rather than the way the type was written. */
type Flat<T> = { [K in keyof T]: T[K] };

export const link = entity(
  {
    id: "web.link",
    name: "Web link",
    description: "One URL of one user. Its versions are web.page entities reached by contents periods.",
  },
  {
    url: z.string(),
    domain: z.string(),
  },
  { order: ["url", "asc"] },
) satisfies z.ZodType<WebLinkDetails>;

const _linkIsTheModulesOwnType: AssertEqual<z.infer<typeof link>, Flat<WebLinkDetails>> = true;
void _linkIsTheModulesOwnType;

export const page = entity(
  {
    id: "web.page",
    name: "Web page",
    description: "One content a URL served, stored once by its SHA-256; it never changes.",
  },
  {
    title: column("name", z.string().nullish()),
    date: column("date", moment().optional()),
    url: z.string(),
    contentHash: z.string(),
    mimeType: z.literal("text/markdown"),
    sizeBytes: z.number(),
    etag: z.string().nullable(),
    lastModified: z.string().nullable(),
  },
  { order: ["date", "desc"] },
) satisfies z.ZodType<WebPageDetails>;

/** The dictionary, plus the two row columns search reads: the page's title is
 * its `name`, and its first-seen time is its `date`. */
const _pageIsTheModulesOwnType: AssertEqual<
  z.infer<typeof page>,
  Flat<WebPageDetails & { title?: string | null | undefined; date?: string | undefined }>
> = true;
void _pageIsTheModulesOwnType;
