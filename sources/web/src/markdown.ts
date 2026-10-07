// sources/web — HTML to Markdown. Readability finds the article; turndown
// with GFM keeps headings, lists, tables, code and link URLs. Nothing
// time-dependent enters the text, so the same HTML always gives the same
// Markdown and the same hash.
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

/** Every control character but newline and tab. */
// eslint-disable-next-line no-control-regex -- matching control characters is this pattern's purpose
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/gu;

/** Remove control characters other than newline and tab. */
export function withoutControlCharacters(text: string): string {
  return text.replace(CONTROL, "");
}

/** Make every link and image URL absolute against the page's own URL, so the
 * Markdown names where a link leads wherever it is read. */
function absoluteUrls(document: Document, base: string): void {
  for (const [selector, attribute] of [["a[href]", "href"], ["img[src]", "src"]] as const) {
    for (const element of document.querySelectorAll(selector)) {
      const value = element.getAttribute(attribute);
      if (value === null) continue;
      try {
        element.setAttribute(attribute, new URL(value, base).href);
      } catch {
        // A value that is not a URL stays as the page wrote it.
      }
    }
  }
}

/** The page's article as Markdown and its title. A page Readability finds
 * no article in is converted whole. */
export function htmlToMarkdown(html: string, url: string): { title: string | null; markdown: string } {
  const { document } = parseHTML(html) as unknown as { document: Document };
  absoluteUrls(document, url);
  const fallbackTitle = document.title.trim();
  const article = new Readability(document).parse();
  const content = article?.content ?? document.body.innerHTML;
  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" });
  turndown.use(gfm);
  const markdown = withoutControlCharacters(turndown.turndown(content)).trim();
  const title = withoutControlCharacters(article?.title ?? fallbackTitle).trim();
  return { title: title === "" ? null : title, markdown };
}
