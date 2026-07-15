//! Google OAuth helpers used by the Gmail + Calendar REST clients.
//!
//! Ported from `backend/src/sources/google/auth.rs`. The connector does OAuth
//! itself: the host injects `_meta = { refresh_token, client_id, client_secret }`
//! on each tool call, and the connector calls [`refresh_access_token`] to mint a
//! short-lived access token before each Gmail / Calendar REST call.

use serde::Deserialize;

/// Google sync errors with distinct variants so callers can react appropriately.
#[derive(Debug)]
pub enum GoogleSyncError {
    /// Refresh token is expired or revoked — user must re-authorize.
    AuthExpired(String),
    /// HTTP 429 rate limit — caller should back off.
    RateLimited { retry_after_secs: u64 },
    /// Gmail historyId expired (404) — caller should re-bootstrap.
    HistoryExpired,
    /// Any other failure (network, API, storage, etc.)
    Other(anyhow::Error),
}

impl std::fmt::Display for GoogleSyncError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AuthExpired(msg) => write!(f, "Google authorization expired: {msg}"),
            Self::RateLimited { retry_after_secs } => {
                write!(f, "Google rate limited: retry after {retry_after_secs}s")
            }
            Self::HistoryExpired => write!(f, "Gmail historyId expired (404)"),
            Self::Other(e) => write!(f, "{e}"),
        }
    }
}

impl From<anyhow::Error> for GoogleSyncError {
    fn from(e: anyhow::Error) -> Self {
        Self::Other(e)
    }
}

/// Check if an HTTP response is a 429 rate-limit response.
///
/// Must be called BEFORE consuming the response body (i.e., before `.text()` or
/// `.json()`). Parses the `Retry-After` header; defaults to 60 seconds if absent
/// or unparseable.
pub fn check_rate_limit(response: &reqwest::Response) -> Option<GoogleSyncError> {
    if response.status() != reqwest::StatusCode::TOO_MANY_REQUESTS {
        return None;
    }

    let retry_after_secs = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(60);

    Some(GoogleSyncError::RateLimited { retry_after_secs })
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

/// Refresh a Google OAuth access token using a refresh token.
pub async fn refresh_access_token(
    client: &reqwest::Client,
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<String, GoogleSyncError> {
    let resp = crate::send_with_retry(client.post("https://oauth2.googleapis.com/token").form(&[
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ]))
    .await
    .map_err(|e| GoogleSyncError::Other(e.into()))?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        if text.contains("invalid_grant") {
            return Err(GoogleSyncError::AuthExpired(text));
        }
        return Err(GoogleSyncError::Other(anyhow::anyhow!(
            "Token refresh failed: {text}"
        )));
    }

    let body: TokenResponse = resp
        .json()
        .await
        .map_err(|e| GoogleSyncError::Other(e.into()))?;
    Ok(body.access_token)
}
