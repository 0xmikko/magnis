/** tst_pub_double_utils_001 — the reimplemented host utilities.
 *
 * `@magnis/host/utils` is the one part of the double that plugins consume for
 * its ANSWER rather than its shape: a card formats a timestamp and asserts the
 * string, picks an avatar colour from a name and asserts the colour. A drifting
 * reimplementation would break those tests somewhere far away, with a message
 * about a card. These pin it at the source.
 */
import { describe, expect, test } from "vitest";

import {
  decodeHtmlEntities,
  formatEmailDate,
  formatFileSize,
  formatMessageTime,
  formatTimeAgo,
  initialsFromName,
  mimeToIcon,
  pickAvatarColor,
  renderableMediaUrl,
  toAvatarColor,
} from "../utils";

describe("tst_pub_double_utils_001", () => {
  test("initials take the first letter of each word, capped and upper-cased", () => {
    expect(initialsFromName("Ada Lovelace")).toBe("AL");
    expect(initialsFromName("ada lovelace king", 3)).toBe("ALK");
    expect(initialsFromName("Prince")).toBe("P");
    // An empty name still has to render SOMETHING in the avatar circle.
    expect(initialsFromName("")).toBe("?");
    expect(initialsFromName("   ")).toBe("?");
  });

  test("avatar colours are stable for a key and clamp to the palette", () => {
    // Stability is the property that matters: the same contact keeps the same
    // colour across renders, sessions and machines.
    expect(pickAvatarColor("ada@example.com")).toBe(pickAvatarColor("ada@example.com"));
    expect(["orange", "blue", "green", "red", "purple", "pink"]).toContain(
      pickAvatarColor("ada@example.com"),
    );
    expect(toAvatarColor("green")).toBe("green");
    expect(toAvatarColor("chartreuse")).toBe("blue");
    // "gray" is a declared AvatarColor but not in the pick palette, so it is
    // not a valid *token* here — the host returns the fallback for it too.
    expect(toAvatarColor("gray")).toBe("blue");
  });

  test("html entities decode, including numeric and hex forms", () => {
    expect(decodeHtmlEntities("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(decodeHtmlEntities("&lt;b&gt;bold&lt;/b&gt;")).toBe("<b>bold</b>");
    expect(decodeHtmlEntities("&quot;quoted&quot; &apos;single&apos;")).toBe(
      '"quoted" \'single\'',
    );
    expect(decodeHtmlEntities("a&nbsp;b")).toBe("a b");
    expect(decodeHtmlEntities("&#65;&#x42;")).toBe("AB");
  });

  test("file sizes switch unit at each 1024 boundary", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1023)).toBe("1023 B");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1024 * 1024 - 1)).toBe("1024 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(5 * 1024 * 1024 + 512 * 1024)).toBe("5.5 MB");
  });

  test("mime types map onto the host's icon names", () => {
    expect(mimeToIcon("image/png")).toBe("file-image");
    expect(mimeToIcon("video/mp4")).toBe("video");
    expect(mimeToIcon("audio/mpeg")).toBe("activity");
    expect(mimeToIcon("application/pdf")).toBe("file");
    expect(mimeToIcon("application/vnd.ms-excel")).toBe("file");
    expect(mimeToIcon("application/zip")).toBe("archive");
    expect(mimeToIcon("")).toBe("file");
  });

  test("an unparseable timestamp formats as empty, not as Invalid Date", () => {
    expect(formatMessageTime("not-a-date")).toBe("");
    expect(formatEmailDate("not-a-date")).toBe("");
    expect(formatTimeAgo("not-a-date")).toBe("");
  });

  test("a timestamp formats to time, and an email date carries both parts", () => {
    const iso = "2026-04-10T12:00:00Z";
    expect(formatMessageTime(iso)).toMatch(/\d{1,2}:\d{2}/);
    // Date · time — the separator is the host's, and chat headers depend on it.
    expect(formatEmailDate(iso)).toContain(" · ");
    expect(formatEmailDate(iso)).toMatch(/2026/);
  });

  test("time ago crosses each threshold", () => {
    const ago = (ms: number): string => formatTimeAgo(new Date(Date.now() - ms).toISOString());
    expect(ago(30_000)).toBe("now");
    expect(ago(5 * 60_000)).toBe("5m ago");
    expect(ago(3 * 3_600_000)).toBe("3h ago");
    expect(ago(2 * 86_400_000)).toBe("2d ago");
    // Past a week it becomes an absolute date rather than a growing count.
    expect(ago(30 * 86_400_000)).toMatch(/\d/);
    expect(ago(30 * 86_400_000)).not.toContain("ago");
  });

  test("synthetic .example media never becomes a browser request", () => {
    expect(renderableMediaUrl(null)).toBeNull();
    expect(renderableMediaUrl("https://cdn.example/photo.jpg")).toBeNull();
    expect(renderableMediaUrl("https://media.telegram.example/p.jpg")).toBeNull();
    expect(renderableMediaUrl("https://cdn.magnis.ai/p.jpg")).toBe("https://cdn.magnis.ai/p.jpg");
  });
});
