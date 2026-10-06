/** The one module that does not write its own entity: the core FileService
 * does, and this plugin owns the schema and the read surface. So the
 * declaration is a contract ACROSS two repositories, and what can be proven
 * here is that it accepts the record the writer produces — the guard on the
 * writer itself lives with the writer, in the product's own suite.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { describe, expect, it } from "vitest";
import { descriptorFrom } from "@magnis/declare/derive";

import { object } from "./entities.ts";

/** Exactly the dictionary `FileService.upload` builds, and the one
 * `register` builds with each of its three per-kind extras. */
const uploaded = {
  name: "q3.pdf",
  mime_type: "application/pdf",
  size_bytes: 12_345,
  local_path: "2026-09/email/q3.pdf",
  source_module: "email",
  source_surface: "file",
  source_ref: {},
};

const registered = {
  mime_type: "image/png",
  source_module: "telegram",
  source_surface: "file",
  source_ref: { account_id: "a1", chat_id: 42, message_id: 7 },
  name: "photo.png",
  size_bytes: 900,
  local_path: "telegram/photos/tg_42_7.png",
  cloud_url: "https://cdn.example.test/tg_42_7.png",
  image: { width: 1024, height: 768 },
};

describe("file declares what the storage engine writes", () => {
  it("both records the writer produces pass the declaration", () => {
    for (const record of [uploaded, registered]) {
      expect(object.safeParse(record).error?.issues ?? []).toEqual([]);
    }
    // …and each per-kind extra, which is a closed set of three.
    expect(object.safeParse({ ...registered, image: undefined, audio: { duration_seconds: 3 } }).success).toBe(true);
    expect(object.safeParse({ ...registered, image: undefined, video: { duration_seconds: 3, width: 1, height: 2 } }).success).toBe(true);
  });

  it("a record without the two keys the writer always sets is refused", () => {
    const { mime_type: _m, ...noMime } = uploaded;
    expect(object.safeParse(noMime).success).toBe(false);
    const { source_module: _s, ...noModule } = uploaded;
    expect(object.safeParse(noModule).success).toBe(false);
  });

  it("the file name is still the search title", () => {
    const { descriptor } = descriptorFrom(object);
    expect(descriptor.search.field).toContainEqual({
      key: "name", kind: "text", path: "name", embed: "title",
    });
    // The source reference is a pointer the storage engine reads, not a filter.
    expect(descriptor.search.field.map((f) => f.key).filter((k) => k.startsWith("source_ref"))).toEqual([]);
  });
});
