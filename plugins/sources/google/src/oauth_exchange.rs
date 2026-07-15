//! `magnis.auth.exchange` — the connector half of the Google OAuth ceremony
//! (`docs/plans/source-auth-typescript.md`, DEC-15/16/25/26).
//!
//! The HOST owns the ceremony (state/PKCE/nonce/consent URL) and, after the
//! browser callback, calls this tool with `_meta` = `{ client_id, client_secret,
//! code, code_verifier, redirect_uri, nonce }`. This connector — the authorized
//! holder of Google's app creds (DEC-16) — exchanges the code at Google's token
//! endpoint, **validates the `id_token`** (DEC-26), confirms the userinfo `sub`
//! matches, and returns `{ credential: refresh_token, identity: { key: sub,
//! label: email } }`. The host stores the refresh_token and redacts upward; the
//! token never returns to the isolate/browser (DEC-14).
//!
//! ### id_token validation (DEC-26)
//! The `id_token` here is received over a **direct, TLS-validated** server↔Google
//! token request (the back-channel code flow), not the browser front-channel. Per
//! OIDC Core §3.1.3.7 the issuer may then be validated via TLS in place of a JWKS
//! signature check, so we validate the **claims** — `iss`, `aud`, `azp`, `exp`,
//! and the session `nonce` — which is what binds this token to THIS ceremony and
//! defeats replay / token-substitution. (A front-channel flow would additionally
//! require JWKS signature verification; we never use one.)

use serde::Deserialize;
use serde_json::{json, Value};

/// Claims we extract + trust from a validated Google `id_token`.
#[derive(Debug, Clone, PartialEq)]
pub struct IdTokenClaims {
    pub sub: String,
    pub email: Option<String>,
}

#[derive(Deserialize)]
struct RawClaims {
    iss: String,
    #[serde(default)]
    aud: Value, // string or [string]
    #[serde(default)]
    azp: Option<String>,
    exp: i64,
    sub: String,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    nonce: Option<String>,
}

/// Google's accepted issuer values.
const GOOGLE_ISS: [&str; 2] = ["accounts.google.com", "https://accounts.google.com"];

/// Decode (without signature verification — see module docs) and validate the
/// claims of a Google `id_token`. Pure + `now`-injected so it is exhaustively
/// unit-tested. Returns the trusted `{ sub, email }` or a reason string.
pub fn validate_id_token_claims(
    id_token: &str,
    expected_aud: &str,
    expected_nonce: &str,
    now_unix: i64,
) -> Result<IdTokenClaims, String> {
    // JWT = header.payload.signature — we read the payload segment.
    let payload_b64 = id_token
        .split('.')
        .nth(1)
        .ok_or_else(|| "id_token is not a JWT".to_string())?;
    let bytes = base64_url_decode(payload_b64)
        .ok_or_else(|| "id_token payload not base64url".to_string())?;
    let claims: RawClaims =
        serde_json::from_slice(&bytes).map_err(|e| format!("id_token claims not JSON: {e}"))?;

    if !GOOGLE_ISS.contains(&claims.iss.as_str()) {
        return Err(format!("id_token iss not Google: {}", claims.iss));
    }
    if !aud_matches(&claims.aud, expected_aud) {
        return Err("id_token aud != client_id".to_string());
    }
    if let Some(azp) = &claims.azp {
        if azp != expected_aud {
            return Err("id_token azp != client_id".to_string());
        }
    }
    if claims.exp <= now_unix {
        return Err("id_token expired".to_string());
    }
    // The nonce binds the token to THIS host ceremony (replay / substitution guard).
    match claims.nonce.as_deref() {
        Some(n) if n == expected_nonce => {}
        _ => return Err("id_token nonce mismatch".to_string()),
    }

    Ok(IdTokenClaims {
        sub: claims.sub,
        email: claims.email,
    })
}

/// `aud` is a string for Google, but the spec allows an array — accept either.
fn aud_matches(aud: &Value, expected: &str) -> bool {
    match aud {
        Value::String(s) => s == expected,
        Value::Array(items) => items.iter().any(|v| v.as_str() == Some(expected)),
        _ => false,
    }
}

/// base64url decode, tolerating both padded and unpadded input.
fn base64_url_decode(s: &str) -> Option<Vec<u8>> {
    use base64::engine::general_purpose::{URL_SAFE, URL_SAFE_NO_PAD};
    use base64::Engine;
    URL_SAFE_NO_PAD
        .decode(s)
        .or_else(|_| URL_SAFE.decode(s))
        .ok()
}

#[derive(Deserialize)]
struct TokenExchangeResponse {
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    id_token: Option<String>,
    #[serde(default)]
    access_token: Option<String>,
}

#[derive(Deserialize)]
struct UserInfo {
    sub: String,
}

fn meta_str<'a>(meta: &'a Value, key: &str) -> Result<&'a str, String> {
    meta.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("magnis.auth.exchange: missing _meta.{key}"))
}

/// Run the host-driven code→token exchange for Google. `args` is the tool-call
/// arguments object; the host-injected inputs live under `args._meta` (DEC-16/24).
pub async fn exchange(args: &Value) -> Result<Value, String> {
    let meta = args.get("_meta").cloned().unwrap_or_else(|| json!({}));
    let client_id = meta_str(&meta, "client_id")?;
    let code = meta_str(&meta, "code")?;
    let code_verifier = meta_str(&meta, "code_verifier")?;
    let redirect_uri = meta_str(&meta, "redirect_uri")?;
    let nonce = meta_str(&meta, "nonce")?;
    // Confidential web client → client_secret present; public PKCE client → absent.
    let client_secret = meta
        .get("client_secret")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty());

    let http = reqwest::Client::new();
    let mut form: Vec<(&str, &str)> = vec![
        ("code", code),
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("grant_type", "authorization_code"),
        ("code_verifier", code_verifier),
    ];
    if let Some(secret) = client_secret {
        form.push(("client_secret", secret));
    }

    let resp = crate::send_with_retry(http.post("https://oauth2.googleapis.com/token").form(&form))
        .await
        .map_err(|e| format!("token exchange request failed: {e}"))?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("token exchange failed: {text}"));
    }
    let body: TokenExchangeResponse = resp
        .json()
        .await
        .map_err(|e| format!("token response not JSON: {e}"))?;

    let refresh_token = body.refresh_token.ok_or_else(|| {
        "token response missing refresh_token (add prompt=consent/access_type=offline)".to_string()
    })?;
    let id_token = body
        .id_token
        .ok_or_else(|| "token response missing id_token".to_string())?;

    let now_unix = chrono::Utc::now().timestamp();
    let claims = validate_id_token_claims(&id_token, client_id, nonce, now_unix)?;

    // Confirm the userinfo subject matches the id_token subject (defence in depth).
    if let Some(access_token) = body.access_token.as_deref() {
        let ui = crate::send_with_retry(
            http.get("https://openidconnect.googleapis.com/v1/userinfo")
                .bearer_auth(access_token),
        )
        .await
        .map_err(|e| format!("userinfo request failed: {e}"))?;
        if ui.status().is_success() {
            let info: UserInfo = ui
                .json()
                .await
                .map_err(|e| format!("userinfo not JSON: {e}"))?;
            if info.sub != claims.sub {
                return Err("userinfo sub != id_token sub".to_string());
            }
        }
    }

    let label = claims.email.clone().unwrap_or_else(|| claims.sub.clone());
    Ok(json!({
        "credential": refresh_token,
        "identity": { "key": claims.sub, "label": label },
    }))
}

/// `magnis.auth.revoke` (DEC-27): ask Google to invalidate the stored
/// refresh_token. The host injects it as `_meta.refresh_token`. Best-effort from
/// the host's side; here we report success/failure of the revoke POST.
pub async fn revoke(args: &Value) -> Result<Value, String> {
    let meta = args.get("_meta").cloned().unwrap_or_else(|| json!({}));
    let token = meta_str(&meta, "refresh_token")?;
    let http = reqwest::Client::new();
    let resp = crate::send_with_retry(
        http.post("https://oauth2.googleapis.com/revoke")
            .form(&[("token", token)]),
    )
    .await
    .map_err(|e| format!("revoke request failed: {e}"))?;
    // Google returns 200 on success; 400 if the token was already invalid — both
    // mean "not usable anymore", which is the goal.
    Ok(json!({ "revoked": resp.status().is_success() || resp.status().as_u16() == 400 }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;

    /// Build an unsigned JWT (header.payload.) with the given claims JSON.
    fn jwt(claims: Value) -> String {
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"RS256","typ":"JWT"}"#);
        let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap());
        format!("{header}.{payload}.sig")
    }

    fn valid_claims() -> Value {
        json!({
            "iss": "https://accounts.google.com",
            "aud": "client-123.apps",
            "azp": "client-123.apps",
            "exp": 2_000_000_000i64,
            "sub": "google-sub-1",
            "email": "user@example.com",
            "nonce": "the-nonce"
        })
    }

    // scn_google_idtoken_001 — a well-formed token with matching aud/nonce/iss and
    // a future exp validates and yields { sub, email }.
    #[test]
    fn tst_google_idtoken_001_valid() {
        let token = jwt(valid_claims());
        let got = validate_id_token_claims(&token, "client-123.apps", "the-nonce", 1_700_000_000)
            .unwrap();
        assert_eq!(got.sub, "google-sub-1");
        assert_eq!(got.email.as_deref(), Some("user@example.com"));
    }

    // scn_google_idtoken_002 — each tampered claim is rejected: wrong aud, wrong
    // nonce, wrong iss, wrong azp, and an expired token.
    #[test]
    fn tst_google_idtoken_002_rejections() {
        let token = jwt(valid_claims());
        // wrong aud
        assert!(
            validate_id_token_claims(&token, "other-client", "the-nonce", 1_700_000_000).is_err()
        );
        // wrong nonce (replay / substitution)
        assert!(
            validate_id_token_claims(&token, "client-123.apps", "stale-nonce", 1_700_000_000)
                .is_err()
        );
        // expired (now past exp)
        assert!(
            validate_id_token_claims(&token, "client-123.apps", "the-nonce", 2_000_000_001)
                .is_err()
        );

        let mut bad_iss = valid_claims();
        bad_iss["iss"] = json!("https://evil.example");
        assert!(validate_id_token_claims(
            &jwt(bad_iss),
            "client-123.apps",
            "the-nonce",
            1_700_000_000
        )
        .is_err());

        let mut bad_azp = valid_claims();
        bad_azp["azp"] = json!("someone-else");
        assert!(validate_id_token_claims(
            &jwt(bad_azp),
            "client-123.apps",
            "the-nonce",
            1_700_000_000
        )
        .is_err());
    }

    // scn_google_idtoken_003 — a missing nonce claim (not just a mismatched one)
    // is rejected: an id_token minted outside our ceremony must not pass.
    #[test]
    fn tst_google_idtoken_003_missing_nonce_rejected() {
        let mut c = valid_claims();
        c.as_object_mut().unwrap().remove("nonce");
        assert!(
            validate_id_token_claims(&jwt(c), "client-123.apps", "the-nonce", 1_700_000_000)
                .is_err()
        );
    }

    // scn_google_idtoken_004 — aud as an array containing the client_id is accepted.
    #[test]
    fn tst_google_idtoken_004_aud_array() {
        let mut c = valid_claims();
        c["aud"] = json!(["client-123.apps", "other"]);
        assert!(
            validate_id_token_claims(&jwt(c), "client-123.apps", "the-nonce", 1_700_000_000)
                .is_ok()
        );
    }
}
