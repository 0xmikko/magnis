/** What linkedin's two entities ARE: the envelope payloads the module stores
 * verbatim, and how each is searched.
 *
 * BUILD TIME ONLY — a leaf. `module/`, `ui/` and `types.ts` import nothing
 * from here.
 *
 * A post's metrics are a nested object, and the hand-written file already
 * reached them by their dotted path — the derivation does the same from the
 * shape, so the path and the key stop being written out by hand.
 */
import { z } from "zod";
import { column, entity, moment, type AssertEqual } from "@magnis/declare";

import type { PostPayload, ProfilePayload } from "./types.ts";

const platform = z.enum(["x", "linkedin"]);

export const profile = entity(
  {
    id: "linkedin.profile",
    name: "LinkedIn profile",
    description: "A tracked person's profile on LinkedIn.",
    roles: ["identity_channel"],
  },
  {
    entity_type: z.literal("profile"),
    platform,
    urn: z.string(),
    handle: z.string(),
    display_name: column("name", z.string().optional()),
    url: z.string().nullish(),
    avatar_url: z.string().nullish(),
    bio: z.string().nullish(),
    verified: z.boolean().nullish(),
    follower_count: z.number().nullish(),
    sync_pass: z.string().optional(),
  },
  { order: ["handle", "asc"], title: "display_name", body: "bio" },
) satisfies z.ZodType<ProfilePayload>;

const _profileIsTheModulesOwnType: AssertEqual<z.infer<typeof profile>, ProfilePayload> = true;
void _profileIsTheModulesOwnType;

export const post = entity(
  {
    id: "linkedin.post",
    name: "LinkedIn post",
    description: "A post from a tracked LinkedIn profile.",
    roles: ["content"],
    triggerable: true,
  },
  {
    entity_type: z.literal("post"),
    platform,
    post_id: z.string(),
    author_handle: z.string(),
    text: z.string(),
    created_at: column("date", moment().nullish()),
    url: z.string().nullish(),
    is_reply: z.boolean().nullish(),
    is_repost: z.boolean().nullish(),
    lang: z.string().nullish(),
    post_type: z.string().optional(),
    article_title: z.string().optional(),
    conversation_id: z.string().optional(),
    media: z
      .array(z.object({
        type: z.string().nullish(),
        url: z.string().nullish(),
        preview_image_url: z.string().nullish(),
        alt_text: z.string().nullish(),
      }))
      .optional(),
    urls: z
      .array(z.object({
        url: z.string().nullish(),
        expanded_url: z.string().nullish(),
        display_url: z.string().nullish(),
      }))
      .optional(),
    metrics: z
      .object({
        likes: z.number().nullish(),
        reposts: z.number().nullish(),
        replies: z.number().nullish(),
        impressions: z.number().nullish(),
      })
      .optional(),
  },
  { order: ["created_at", "desc"], title: "text", body: "text" },
) satisfies z.ZodType<PostPayload>;

const _postIsTheModulesOwnType: AssertEqual<z.infer<typeof post>, PostPayload> = true;
void _postIsTheModulesOwnType;
