/** sources/web turns HTML into Markdown, of the web-source plan
 * (`docs/plans/web-source.md` in magnis-app, Stage D2-S2): Readability finds
 * the article, turndown with GFM keeps headings, lists, tables, code and link
 * URLs, control characters go, and the same HTML always gives the same text.
 * @test-id: tst_web_src_md_001
 * @deterministic: yes
 */
import { describe, expect, test } from "bun:test";

import { htmlToMarkdown } from "./markdown";

const ARTICLE = `<!doctype html>
<html><head><title>Fallback title</title></head>
<body>
  <nav><a href="/home">Home</a> <a href="/about">About</a></nav>
  <article>
    <h1>The article</h1>
    <p>First paragraph with a <a href="/docs/guide?x=1">relative link</a> and an <a href="https://other.example/page">absolute one</a>.\u0007</p>
    <h2>A table</h2>
    <table>
      <thead><tr><th>Name</th><th>Count</th></tr></thead>
      <tbody><tr><td>apples</td><td>3</td></tr><tr><td>pears</td><td>5</td></tr></tbody>
    </table>
    <ul><li>one</li><li>two</li></ul>
    <pre><code>const x = 1;</code></pre>
    <p>${"A long sentence that makes this the article Readability keeps. ".repeat(20)}</p>
  </article>
  <footer>Copyright</footer>
</body></html>`;

describe("HTML to Markdown", () => {
  test("tst_web_src_md_001 the same HTML twice gives byte-identical Markdown with headings, tables and link URLs kept", () => {
    const first = htmlToMarkdown(ARTICLE, "https://example.com/news/article");
    const second = htmlToMarkdown(ARTICLE, "https://example.com/news/article");
    expect(second).toEqual(first);

    expect(first.title).toBe("Fallback title");
    const { markdown } = first;
    expect(markdown).toContain("## A table");
    expect(markdown).toContain("| Name | Count |");
    expect(markdown).toContain("| apples | 3 |");
    expect(markdown).toContain("-   one\n-   two");
    expect(markdown).toContain("```\nconst x = 1;\n```");
    expect(markdown).toContain("[relative link](https://example.com/docs/guide?x=1)");
    expect(markdown).toContain("[absolute one](https://other.example/page)");
    expect(markdown).not.toContain("Copyright");
    // No control character but newline and tab survives.
    expect(/[\u0000-\u0008\u000B-\u001F\u007F]/u.test(markdown)).toBe(false);
  });
});
