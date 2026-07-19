// x connector — free post-rendering helpers, factored out of fetch.ts so the
// envelope builders read cleanly (mirrors the module pilot's linkedin
// module/helpers.ts split of `richPostFields`). Pure functions over an XTweet.

import type { XTweet } from "./api";

/** ContentOS ingest port (social-post-rendering S4 / INV-1): X truncates `.text`
 *  at 280 — the FULL body lives in article.plain_text (Article) or
 *  note_tweet.text (long-form). Store the full text, never the teaser. */
export function fullText(tweet: XTweet): string {
  return tweet.article?.plain_text ?? tweet.note_tweet?.text ?? tweet.text;
}

/** Type precedence: article > long_form > reply > post (ContentOS tweetType;
 *  threads deferred — no conversation assembly in v1). */
export function postType(tweet: XTweet, isReply: boolean): string {
  if (tweet.article?.plain_text || tweet.article?.title) return "article";
  if (tweet.note_tweet?.text) return "long_form";
  if (isReply) return "reply";
  return "post";
}
