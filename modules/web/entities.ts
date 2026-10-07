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

/** The keys a link written by the native Web module still carries. New links
 * write none of them; `content` holds the native text that `web.repair` turns
 * into the link's first page. */
interface NativeLinkKeys {
  title?: string;
  description?: string;
  favicon_url?: string;
  og_image_url?: string;
  etag?: string;
  last_modified?: string;
  maxAgeSeconds?: number;
  expires_at?: string;
  content?: {
    content_markdown?: string;
    content_length?: number;
    extracted_at?: string;
    etag?: string;
    last_modified?: string;
    maxAgeSeconds?: number;
    expires_at?: string;
  };
}

export const link = entity(
  {
    id: "web.link",
    name: "Web link",
    description: "One URL of one user. Its versions are web.page entities reached by contents periods.",
  },
  {
    url: z.string(),
    domain: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    favicon_url: z.string().optional(),
    og_image_url: z.string().optional(),
    etag: z.string().optional(),
    last_modified: z.string().optional(),
    maxAgeSeconds: z.number().optional(),
    expires_at: z.string().optional(),
    content: z
      .object({
        content_markdown: z.string().optional(),
        content_length: z.number().optional(),
        extracted_at: z.string().optional(),
        etag: z.string().optional(),
        last_modified: z.string().optional(),
        maxAgeSeconds: z.number().optional(),
        expires_at: z.string().optional(),
      })
      .optional(),
  },
  { order: ["url", "asc"] },
) satisfies z.ZodType<WebLinkDetails & NativeLinkKeys>;

const _linkIsTheModulesOwnType: AssertEqual<z.infer<typeof link>, Flat<WebLinkDetails & NativeLinkKeys>> = true;
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
