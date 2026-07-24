import { describe, expect, test } from "bun:test";
import { exchange, revoke, validateIdTokenClaims } from "./oauth";
import type { FetchLike, HttpResponse } from "./http";

function ok(data: unknown): HttpResponse {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(data),
    json: async () => data,
  };
}

function status(code: number, body = ""): HttpResponse {
  return {
    ok: code >= 200 && code < 300,
    status: code,
    headers: { get: () => null },
    text: async () => body,
    json: async () => JSON.parse(body || "{}"),
  };
}

/** Build an unsigned JWT (header.payload.sig) with the given claims. */
function jwt(claims: Record<string, unknown>): string {
  const header = Buffer.from('{"alg":"RS256","typ":"JWT"}').toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.sig`;
}

function validClaims(): Record<string, unknown> {
  return {
    iss: "https://accounts.google.com",
    aud: "client-123.apps",
    azp: "client-123.apps",
    exp: 2_000_000_000,
    sub: "google-sub-1",
    email: "user@example.com",
    nonce: "the-nonce",
  };
}

const NOW = 1_700_000_000;

describe("id_token claim validation", () => {
  test("tst_gts_oidc_001 valid token → { sub, email }", () => {
    const got = validateIdTokenClaims(
      jwt(validClaims()),
      "client-123.apps",
      "the-nonce",
      NOW,
    );
    expect(got).toEqual({ sub: "google-sub-1", email: "user@example.com" });
  });

  test("tst_gts_oidc_002 tampered claims rejected", () => {
    const token = jwt(validClaims());
    // wrong aud
    expect(() =>
      validateIdTokenClaims(token, "other-client", "the-nonce", NOW),
    ).toThrow("id_token aud != client_id");
    // wrong nonce (replay / substitution)
    expect(() =>
      validateIdTokenClaims(token, "client-123.apps", "stale-nonce", NOW),
    ).toThrow("id_token nonce mismatch");
    // expired (now past exp)
    expect(() =>
      validateIdTokenClaims(token, "client-123.apps", "the-nonce", 2_000_000_001),
    ).toThrow("id_token expired");
    // wrong iss
    expect(() =>
      validateIdTokenClaims(
        jwt({ ...validClaims(), iss: "https://evil.example" }),
        "client-123.apps",
        "the-nonce",
        NOW,
      ),
    ).toThrow(/id_token iss not Google/);
    // wrong azp
    expect(() =>
      validateIdTokenClaims(
        jwt({ ...validClaims(), azp: "someone-else" }),
        "client-123.apps",
        "the-nonce",
        NOW,
      ),
    ).toThrow("id_token azp != client_id");
    // MISSING nonce (not just mismatched) is rejected too
    const noNonce = validClaims();
    delete noNonce.nonce;
    expect(() =>
      validateIdTokenClaims(jwt(noNonce), "client-123.apps", "the-nonce", NOW),
    ).toThrow("id_token nonce mismatch");
    // not a JWT at all
    expect(() =>
      validateIdTokenClaims("garbage", "client-123.apps", "the-nonce", NOW),
    ).toThrow("id_token is not a JWT");
  });

  test("tst_gts_oidc_003 aud as array containing client_id accepted", () => {
    const got = validateIdTokenClaims(
      jwt({ ...validClaims(), aud: ["client-123.apps", "other"] }),
      "client-123.apps",
      "the-nonce",
      NOW,
    );
    expect(got.sub).toBe("google-sub-1");
  });
});

const META = {
  client_id: "client-123.apps",
  client_secret: "shh",
  code: "auth-code",
  code_verifier: "verifier",
  redirect_uri: "http://localhost/auth/sources/google/callback",
  nonce: "the-nonce",
};

describe("magnis.auth.exchange", () => {
  test("tst_gts_oidc_004 happy path: form fields, userinfo check, result shape", async () => {
    const calls: { url: string; init?: Record<string, unknown> }[] = [];
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({ url, init });
      if (url === "https://oauth2.googleapis.com/token") {
        return ok({
          refresh_token: "rt-1",
          id_token: jwt(validClaims()),
          access_token: "at-1",
        });
      }
      if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
        return ok({ sub: "google-sub-1" });
      }
      throw new Error(`unexpected url ${url}`);
    };

    const result = await exchange(META, fetchFn, NOW);
    expect(result).toEqual({
      credential: "rt-1",
      identity: { key: "google-sub-1", label: "user@example.com" },
    });

    // Token POST is form-encoded with the full grant.
    const call0 = calls[0];
    if (call0 === undefined) throw new Error("exchange: missing token call");
    const form = new URLSearchParams(call0.init?.body as string);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("auth-code");
    expect(form.get("code_verifier")).toBe("verifier");
    expect(form.get("client_id")).toBe("client-123.apps");
    expect(form.get("client_secret")).toBe("shh");
    expect(form.get("redirect_uri")).toBe(META.redirect_uri);
    // Userinfo hit with the bearer.
    const call1 = calls[1];
    if (call1 === undefined) throw new Error("exchange: missing userinfo call");
    const headers = call1.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer at-1");
  });

  test("tst_gts_oidc_005 rejects: missing meta key / refresh_token / sub mismatch / bad nonce", async () => {
    const never: FetchLike = async () => {
      throw new Error("no network expected");
    };
    // Missing input → the (Rust-mirrored) exchange-prefixed message.
    await expect(exchange({ ...META, nonce: "" }, never, NOW)).rejects.toThrow(
      "magnis.auth.exchange: missing _meta.nonce",
    );

    // No refresh_token in the token response.
    const noRt: FetchLike = async () =>
      ok({ id_token: jwt(validClaims()), access_token: "at" });
    await expect(exchange(META, noRt, NOW)).rejects.toThrow(
      /missing refresh_token \(add prompt=consent\/access_type=offline\)/,
    );

    // id_token minted for a different ceremony (nonce) → rejected.
    const badNonce: FetchLike = async () =>
      ok({
        refresh_token: "rt",
        id_token: jwt({ ...validClaims(), nonce: "other" }),
      });
    await expect(exchange(META, badNonce, NOW)).rejects.toThrow(
      "id_token nonce mismatch",
    );

    // userinfo sub mismatch → rejected (defence in depth).
    const mismatch: FetchLike = async (url) =>
      url.endsWith("/token")
        ? ok({ refresh_token: "rt", id_token: jwt(validClaims()), access_token: "at" })
        : ok({ sub: "SOMEONE-ELSE" });
    await expect(exchange(META, mismatch, NOW)).rejects.toThrow(
      "userinfo sub != id_token sub",
    );

    // Non-2xx token endpoint → surfaced with the body.
    const denied: FetchLike = async () => status(400, '{"error":"invalid_grant"}');
    await expect(exchange(META, denied, NOW)).rejects.toThrow(
      /^token exchange failed: /,
    );
  });

  test("tst_gts_oidc_006 label falls back to sub when email absent; no userinfo without access_token", async () => {
    const claims = validClaims();
    delete claims.email;
    const calls: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      calls.push(url);
      return ok({ refresh_token: "rt", id_token: jwt(claims) }); // no access_token
    };
    const result = await exchange(META, fetchFn, NOW);
    expect(result.identity).toEqual({ key: "google-sub-1", label: "google-sub-1" });
    expect(calls).toHaveLength(1); // userinfo NOT called
  });
});

describe("magnis.auth.revoke", () => {
  test("tst_gts_oidc_007 200 and 400 both revoked; 500 not; missing token errors", async () => {
    let sentBody: string | undefined;
    const okFn: FetchLike = async (_url, init) => {
      sentBody = init?.body as string;
      return status(200);
    };
    expect(await revoke({ refresh_token: "rt-9" }, okFn)).toEqual({ revoked: true });
    expect(new URLSearchParams(sentBody).get("token")).toBe("rt-9");

    const already: FetchLike = async () => status(400, "invalid token");
    expect(await revoke({ refresh_token: "rt" }, already)).toEqual({ revoked: true });

    const broken: FetchLike = async () => status(500, "boom");
    expect(await revoke({ refresh_token: "rt" }, broken)).toEqual({ revoked: false });

    await expect(revoke({}, okFn)).rejects.toThrow(
      "magnis.auth.exchange: missing _meta.refresh_token",
    );
  });
});
