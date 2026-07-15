// tst_parse (social-contact-identity S1, DEC-10/INV-3): parseSocialUrl accepts
// exactly the documented forms per platform and rejects everything else with a
// typed invalid_url error — no silent guessing.
import { describe, expect, it, vi } from "vitest";
import { parseSocialUrl } from "../socialUrl.ts";

// LIVE BUG (2026-07-02): the V8 isolate (bare deno_core) has NO global URL —
// `new URL(...)` threw ReferenceError, the try/catch swallowed it, and every
// VALID pasted URL came back invalid_url in production while Node-run tests
// stayed green. The parser must work with no URL global at all.
describe("parseSocialUrl without a URL global (isolate reality)", () => {
  it("parses a full linkedin URL with URL undefined", () => {
    vi.stubGlobal("URL", undefined);
    try {
      expect(parseSocialUrl("linkedin", "https://www.linkedin.com/in/i20h/")).toEqual({
        ok: true,
        handle: "i20h",
      });
      expect(parseSocialUrl("x", "https://x.com/jack?ref=1")).toEqual({
        ok: true,
        handle: "jack",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("parseSocialUrl — accepted forms (tst_parse)", () => {
  const ok: Array<[string, "x" | "linkedin", string]> = [
    // LinkedIn full URLs
    ["https://linkedin.com/in/i20h", "linkedin", "i20h"],
    ["https://www.linkedin.com/in/i20h", "linkedin", "i20h"],
    ["https://www.linkedin.com/in/i20h/", "linkedin", "i20h"],
    ["https://www.linkedin.com/in/i20h/details/experience/", "linkedin", "i20h"],
    ["https://linkedin.com/in/ann-doe-42?utm_source=share", "linkedin", "ann-doe-42"],
    ["https://linkedin.com/in/i20h#about", "linkedin", "i20h"],
    // %-encoded unicode slug passes through decoded
    ["https://linkedin.com/in/%D0%B0%D0%BD%D0%BD%D0%B0", "linkedin", "%D0%B0%D0%BD%D0%BD%D0%B0"],
    // X full URLs (x.com and twitter.com)
    ["https://x.com/0xmikko_eth", "x", "0xmikko_eth"],
    ["https://www.x.com/0xmikko_eth/", "x", "0xmikko_eth"],
    ["https://twitter.com/jack?ref=abc", "x", "jack"],
    ["https://x.com/jack/status/123", "x", "jack"],
    // handle forms
    ["@jack", "x", "jack"],
    ["jack", "x", "jack"],
    ["@i20h", "linkedin", "i20h"],
    ["i20h", "linkedin", "i20h"],
  ];
  for (const [input, platform, want] of ok) {
    it(`${platform}: ${input} → ${want}`, () => {
      expect(parseSocialUrl(platform, input)).toEqual({ ok: true, handle: want });
    });
  }
});

describe("parseSocialUrl — rejected forms (tst_parse)", () => {
  const bad: Array<[string, "x" | "linkedin"]> = [
    ["https://linkedin.com/company/lagrange-labs", "linkedin"], // non-profile path
    ["https://linkedin.com/in/", "linkedin"], // empty slug
    ["https://x.com/home", "x"], // reserved segment
    ["https://x.com/i/lists/123", "x"], // reserved segment
    ["https://x.com/search?q=jack", "x"],
    ["https://evil.com/in/i20h", "linkedin"], // wrong host
    ["https://x.com/", "x"],
    ["@way_too_long_for_an_x_handle", "x"], // 16+ chars
    ["ab", "linkedin"], // linkedin slug min 3
    ["ha ndle", "x"], // whitespace
    ["", "x"],
    ["https://x.com/jack", "linkedin"], // x URL given to linkedin
  ];
  for (const [input, platform] of bad) {
    it(`${platform}: rejects ${JSON.stringify(input)}`, () => {
      expect(parseSocialUrl(platform, input)).toEqual({ ok: false, error: "invalid_url" });
    });
  }
});
