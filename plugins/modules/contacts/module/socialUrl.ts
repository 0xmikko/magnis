// parseSocialUrl: the ONE place that
// turns operator input (profile URL / @handle / bare handle) into a bare
// normalized handle per platform. Accepts exactly the documented forms;
// everything else → typed invalid_url. No silent guessing (NO FALLBACKS).

export type SocialPlatform = "x" | "linkedin";

export type ParseSocialResult =
  | { ok: true; handle: string }
  | { ok: false; error: "invalid_url" };

const INVALID: ParseSocialResult = { ok: false, error: "invalid_url" };

// X handles: 1-15 chars, word chars only (twitter's own rule).
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
// LinkedIn public vanity slugs: 3-100 chars; %-encoded unicode passes through.
const LI_SLUG = /^[A-Za-z0-9%-]{3,100}$/;

// First path segments on x.com/twitter.com that are app routes, not profiles.
const X_RESERVED = new Set([
  "home",
  "search",
  "explore",
  "i",
  "settings",
  "notifications",
  "messages",
  "compose",
  "intent",
]);

function validate(platform: SocialPlatform, handle: string): ParseSocialResult {
  const re = platform === "x" ? X_HANDLE : LI_SLUG;
  return re.test(handle) ? { ok: true, handle } : INVALID;
}

export function parseSocialUrl(platform: SocialPlatform, input: string): ParseSocialResult {
  const raw = input.trim();
  if (!raw) return INVALID;

  // Pure string parsing — the V8 isolate (bare deno_core) has NO URL global,
  // so `new URL` is unusable here (live bug 2026-07-02: ReferenceError was
  // swallowed and every valid pasted URL came back invalid_url).
  if (/^https?:\/\//i.test(raw)) {
    const afterScheme = raw.replace(/^https?:\/\//i, "");
    const slash = afterScheme.indexOf("/");
    const hostRaw = (slash === -1 ? afterScheme : afterScheme.slice(0, slash)).toLowerCase();
    // Userinfo / port tricks are rejected outright (SSRF-adjacent rules).
    if (!hostRaw || hostRaw.includes("@") || hostRaw.includes(":")) return INVALID;
    const host = hostRaw.replace(/^www\./, "");
    // Query/fragment dropped BEFORE segmenting.
    const path = slash === -1 ? "" : afterScheme.slice(slash + 1).replace(/[?#].*$/s, "");
    const segments = path.split("/").filter(Boolean);

    if (platform === "linkedin") {
      if (host !== "linkedin.com") return INVALID;
      // Only /in/<slug> is a profile; /company/… etc. are not.
      if (segments[0] !== "in" || !segments[1]) return INVALID;
      return validate(platform, segments[1]);
    }
    if (host !== "x.com" && host !== "twitter.com") return INVALID;
    const handle = segments[0];
    if (!handle || X_RESERVED.has(handle.toLowerCase())) return INVALID;
    return validate(platform, handle);
  }

  // @handle / bare handle.
  return validate(platform, raw.replace(/^@+/, ""));
}
