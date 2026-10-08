/** What the Web module stores, as its declarations derive: a link found by its
 * URL and domain, a page found by its title, URL and first-seen date, and no
 * field the semantic index embeds.
 *
 * Beside entities.ts and outside module/ on purpose.
 * @test-id: tst_web_entities_001
 */
import { describe, expect, it } from "vitest";
import { descriptorFrom } from "@magnis/declare/derive";

import { link, page } from "./entities.ts";

function fields(schema: Parameters<typeof descriptorFrom>[0]) {
  return descriptorFrom(schema).descriptor.search.field;
}

describe("web declares a link and a page", () => {
  it("tst_web_entities_001 the derived declarations have the declared fields and no embed", () => {
    const linkFields = fields(link);
    expect(linkFields.map(({ key, kind }) => [key, kind])).toEqual([
      ["url", "text"],
      ["domain", "text"],
    ]);
    const { json_schema: linkSchema } = descriptorFrom(link).descriptor;
    expect(linkSchema).toMatchObject({ additionalProperties: false, required: ["url", "domain"] });

    const pageFields = fields(page);
    expect(pageFields.map(({ key, kind, path, column }) => [key, kind, path ?? column])).toEqual([
      ["title", "text", "name"],
      ["date", "date", "date"],
      ["url", "text", "url"],
      ["contentHash", "text", "contentHash"],
      ["mimeType", "text", "mimeType"],
      ["sizeBytes", "number", "sizeBytes"],
      ["etag", "text", "etag"],
      ["lastModified", "text", "lastModified"],
    ]);
    const { json_schema: pageSchema } = descriptorFrom(page).descriptor;
    expect(pageSchema).toMatchObject({
      additionalProperties: false,
      required: ["url", "contentHash", "mimeType", "sizeBytes", "etag", "lastModified"],
    });

    for (const field of [...linkFields, ...pageFields]) expect(field.embed, field.key).toBeUndefined();
    expect(page.safeParse({
      url: "https://example.com/a", contentHash: "a".repeat(64), mimeType: "text/markdown",
      sizeBytes: 12, etag: null, lastModified: null,
    }).success).toBe(true);
    expect(link.safeParse({ url: "https://example.com/a", domain: "example.com" }).success).toBe(true);
  });
});
