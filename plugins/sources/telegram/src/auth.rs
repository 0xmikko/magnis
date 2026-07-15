//! `magnis.auth.begin` / `magnis.auth.step` — the connector half of the Telegram
//! MTProto login (`docs/plans/source-auth-typescript.md`, DEC-15/16/21/24).
//!
//! phone_code is **stateful**: `begin` requests the login code and must keep the
//! live grammers `Client` + its `LoginToken` in memory for the subsequent `step`
//! (grammers' `LoginToken` is not reconstructable out-of-process). The host runs
//! ONE connector instance per auth session (DEC-21/34), so this module parks the
//! in-flight flow in a process-global slot across calls.
//!
//! The host injects the app-creds `api_id`/`api_hash` + the user-typed `phone` /
//! `code` / `password` per call via `_meta` (DEC-24) — none of them are arguments
//! the isolate/browser can forge. On success the connector serializes the now
//! authorized grammers session and returns it as the `credential` (the host
//! stores it keyed by connection_id; it never returns to the browser, DEC-14).

use std::sync::OnceLock;

use base64::Engine;
use grammers_client::client::auth::SignInError;
use grammers_client::types::{LoginToken, PasswordToken, User};
use grammers_client::{Client, Config, InitParams};
use grammers_session::Session;
use serde_json::{json, Value};
use tokio::sync::Mutex;

/// In-flight login state, parked between `begin` and `step` calls within the
/// session's single connector process.
enum AuthFlow {
    AwaitingCode {
        client: Client,
        token: LoginToken,
    },
    // PasswordToken is large (full SRP params) — box it so the enum variants
    // don't differ wildly in size.
    AwaitingPassword {
        client: Client,
        token: Box<PasswordToken>,
    },
}

fn flow_slot() -> &'static Mutex<Option<AuthFlow>> {
    static SLOT: OnceLock<Mutex<Option<AuthFlow>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn meta(args: &Value) -> &Value {
    args.get("_meta").unwrap_or(&Value::Null)
}

fn meta_str(m: &Value, key: &str) -> Result<String, String> {
    m.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("magnis.auth: missing _meta.{key}"))
}

fn meta_api_id(m: &Value) -> Result<i32, String> {
    // The host may inject api_id as a number or a string (env is a string).
    if let Some(n) = m.get("api_id").and_then(Value::as_i64) {
        return Ok(n as i32);
    }
    m.get("api_id")
        .and_then(Value::as_str)
        .and_then(|s| s.parse::<i32>().ok())
        .ok_or_else(|| "magnis.auth: missing or invalid _meta.api_id".to_string())
}

fn init_params() -> InitParams {
    InitParams {
        device_model: "Magnis".to_string(),
        system_version: "1.0".to_string(),
        app_version: "0.1.0".to_string(),
        system_lang_code: "en".to_string(),
        lang_code: "en".to_string(),
        ..Default::default()
    }
}

/// `magnis.auth.begin`: connect with a fresh session and request the login code.
pub async fn begin(args: &Value) -> Result<Value, String> {
    let m = meta(args);
    let api_id = meta_api_id(m)?;
    let api_hash = meta_str(m, "api_hash")?;
    let phone = meta_str(m, "phone")?;

    let client = Client::connect(Config {
        session: Session::new(),
        api_id,
        api_hash: api_hash.clone(),
        params: init_params(),
    })
    .await
    .map_err(|e| format!("telegram connect failed: {e}"))?;

    let token = client
        .request_login_code(&phone)
        .await
        .map_err(|e| format!("request_login_code failed: {e}"))?;

    *flow_slot().lock().await = Some(AuthFlow::AwaitingCode { client, token });
    Ok(json!({ "state": "code_sent" }))
}

/// `magnis.auth.step`: submit the login code (and, if 2FA, the password). Returns
/// an intermediate `{ state: "password" }` when 2FA is required, else the minted
/// `{ credential, identity }`.
pub async fn step(args: &Value) -> Result<Value, String> {
    let m = meta(args);
    let mut guard = flow_slot().lock().await;
    let flow = guard
        .take()
        .ok_or_else(|| "no telegram login in progress (call begin first)".to_string())?;

    match flow {
        AuthFlow::AwaitingCode { client, token } => {
            let code = meta_str(m, "code")?;
            match client.sign_in(&token, &code).await {
                Ok(user) => minted(&client, &user),
                Err(SignInError::PasswordRequired(pw)) => {
                    // Park for the password step; the browser prompts for it.
                    *guard = Some(AuthFlow::AwaitingPassword {
                        client,
                        token: Box::new(pw),
                    });
                    Ok(json!({ "state": "password" }))
                }
                Err(SignInError::InvalidCode) => {
                    // Recoverable: keep the flow so the user can re-enter the code.
                    *guard = Some(AuthFlow::AwaitingCode { client, token });
                    Err("invalid login code".to_string())
                }
                Err(e) => Err(format!("sign_in failed: {e}")),
            }
        }
        AuthFlow::AwaitingPassword { client, token } => {
            let password = meta_str(m, "password")?;
            match client.check_password(*token, password.as_bytes()).await {
                Ok(user) => minted(&client, &user),
                Err(e) => Err(format!("check_password failed: {e}")),
            }
        }
    }
}

/// `magnis.auth.revoke` (DEC-27): log the session out provider-side so the
/// minted session blob can no longer be used. The host injects the stored
/// `session` blob as `_meta.session` (+ app-creds). Best-effort from the host's
/// side; here we report whether logout succeeded.
pub async fn revoke(args: &Value) -> Result<Value, String> {
    let m = meta(args);
    let api_id = meta_api_id(m)?;
    let api_hash = meta_str(m, "api_hash")?;
    let session_b64 = meta_str(m, "session")?;
    let session_bytes = base64::engine::general_purpose::STANDARD
        .decode(&session_b64)
        .map_err(|e| format!("invalid base64 session: {e}"))?;
    let session =
        Session::load(&session_bytes).map_err(|e| format!("failed to load session: {e}"))?;

    let client = Client::connect(Config {
        session,
        api_id,
        api_hash,
        params: init_params(),
    })
    .await
    .map_err(|e| format!("telegram connect failed: {e}"))?;

    let ok = client.sign_out().await.is_ok();
    Ok(json!({ "revoked": ok }))
}

/// Serialize the now-authorized grammers session as the credential and project the
/// account identity (DEC-13: key = immutable numeric user id).
fn minted(client: &Client, user: &User) -> Result<Value, String> {
    let session_b64 = base64::engine::general_purpose::STANDARD.encode(client.session().save());
    let label = user
        .username()
        .map(|u| format!("@{u}"))
        .unwrap_or_else(|| user.full_name());
    Ok(json!({
        "credential": session_b64,
        "identity": { "key": user.id().to_string(), "label": label },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    // scn_tg_auth_001 — meta() returns the _meta object, or Null when absent.
    #[test]
    fn tst_tg_auth_001_meta_extracts_meta_object() {
        assert_eq!(meta(&json!({ "_meta": { "a": 1 } })), &json!({ "a": 1 }));
        assert_eq!(meta(&json!({})), &Value::Null);
    }

    // scn_tg_auth_002 — meta_str: present non-empty → Ok; missing / empty / non-
    // string → Err (the host-injected app-creds + user inputs must be real strings).
    #[test]
    fn tst_tg_auth_002_meta_str_validates() {
        let m = json!({ "api_hash": "deadbeef", "blank": "", "num": 5 });
        assert_eq!(meta_str(&m, "api_hash").unwrap(), "deadbeef");
        assert!(meta_str(&m, "missing").is_err());
        assert!(meta_str(&m, "blank").is_err(), "empty string is rejected");
        assert!(meta_str(&m, "num").is_err(), "non-string is rejected");
    }

    // scn_tg_auth_003 — meta_api_id: number OR numeric string (env is a string)
    // parse to i32; missing / non-numeric string → Err.
    #[test]
    fn tst_tg_auth_003_meta_api_id_number_or_string() {
        assert_eq!(meta_api_id(&json!({ "api_id": 12345 })).unwrap(), 12345);
        assert_eq!(meta_api_id(&json!({ "api_id": "12345" })).unwrap(), 12345);
        assert!(meta_api_id(&json!({})).is_err(), "missing api_id");
        assert!(
            meta_api_id(&json!({ "api_id": "not-a-number" })).is_err(),
            "non-numeric string"
        );
    }
}
