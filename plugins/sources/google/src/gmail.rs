//! Gmail surface: REST client + canonical conversion + the Sync-Profile fetch
//! logic, ported from `backend/src/sources/google/mail/{client,runtime}.rs`.
//!
//! The connector serves the `email` surface. `fetch_email` produces the same
//! `{ envelopes, nextCursor, hasMore }` triple the in-backend Gmail runtime did,
//! where each envelope's `payload` is a flattened `MailMessage` (see
//! [`flatten_mail_payload`]) and `remote_id` is the Gmail message id.

use std::collections::{BTreeMap, BTreeSet};

use anyhow::Result;
use chrono::DateTime;
use futures::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};

/// How many `messages.get` calls to run concurrently when hydrating a page.
/// Gmail's per-user quota is ~250 units/sec and `messages.get` costs 5 units
/// (~50/sec), so a small fan-out stays well within it while cutting the
/// wall-clock from 50 sequential round-trips to ~⌈50/N⌉ — without the burst that
/// would risk a 429 (which `send_with_retry` does NOT retry).
const GMAIL_FETCH_CONCURRENCY: usize = 8;

use crate::auth::{check_rate_limit, GoogleSyncError};
use crate::mime::{collect_attachments, decode_base64url, extract_body_content};
use crate::surfaces::{EmailAddress, MailAttachment, MailDraft, MailMessage, SendResult};

// ── Gmail API response types (ported from mail/client.rs) ─────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListMessagesResponse {
    pub messages: Option<Vec<GmailMessageRef>>,
    pub next_page_token: Option<String>,
}

#[derive(Deserialize)]
pub struct GmailMessageRef {
    pub id: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GmailMessage {
    pub id: String,
    pub thread_id: Option<String>,
    pub label_ids: Option<Vec<String>>,
    pub snippet: Option<String>,
    pub payload: Option<GmailPayload>,
    pub internal_date: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GmailPayload {
    pub mime_type: Option<String>,
    pub headers: Option<Vec<GmailHeader>>,
    pub body: Option<GmailBody>,
    pub parts: Option<Vec<GmailPart>>,
}

#[derive(Deserialize, Clone)]
pub struct GmailHeader {
    pub name: String,
    pub value: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GmailBody {
    pub attachment_id: Option<String>,
    pub size: Option<u64>,
    pub data: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GmailPart {
    pub mime_type: Option<String>,
    pub filename: Option<String>,
    #[allow(dead_code)]
    pub headers: Option<Vec<GmailHeader>>,
    pub body: Option<GmailBody>,
    pub parts: Option<Vec<GmailPart>>,
}

#[derive(Deserialize)]
struct AttachmentResponse {
    data: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GmailProfile {
    pub history_id: String,
    /// Total messages in the mailbox (Gmail `users/me/profile.messagesTotal`).
    /// Used as the bootstrap `total` estimate (DEC-4). Optional: a profile body
    /// without it deserializes to `None` (indeterminate).
    #[serde(default)]
    pub messages_total: Option<u64>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HistoryListResponse {
    #[serde(default)]
    pub history: Vec<HistoryEntry>,
    pub next_page_token: Option<String>,
    pub history_id: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    #[serde(default)]
    pub messages_added: Vec<HistoryMessageEvent>,
    #[serde(default)]
    pub messages_deleted: Vec<HistoryMessageEvent>,
    #[serde(default)]
    pub labels_added: Vec<HistoryLabelEvent>,
    #[serde(default)]
    pub labels_removed: Vec<HistoryLabelEvent>,
}

#[derive(Deserialize, Debug)]
pub struct HistoryMessageEvent {
    pub message: HistoryMessageRef,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HistoryLabelEvent {
    pub message: HistoryMessageRef,
    #[allow(dead_code)]
    #[serde(default)]
    pub label_ids: Vec<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMessageRef {
    pub id: String,
    #[allow(dead_code)]
    pub thread_id: Option<String>,
}

// ── REST client ──────────────────────────────────────────────

#[derive(Clone)]
pub struct GmailApiClient {
    client: reqwest::Client,
    access_token: String,
}

impl GmailApiClient {
    pub fn new(client: reqwest::Client, access_token: String) -> Self {
        Self {
            client,
            access_token,
        }
    }

    pub async fn list_messages_page(
        &self,
        page_token: Option<&str>,
    ) -> Result<ListMessagesResponse, GoogleSyncError> {
        let mut url =
            "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50".to_string();
        if let Some(token) = page_token {
            url.push_str(&format!("&pageToken={token}"));
        }

        let response =
            crate::send_with_retry(self.client.get(&url).bearer_auth(&self.access_token))
                .await
                .map_err(|error| GoogleSyncError::Other(error.into()))?;

        if let Some(rate_limit) = check_rate_limit(&response) {
            return Err(rate_limit);
        }

        if !response.status().is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(GoogleSyncError::Other(anyhow::anyhow!(
                "Gmail list messages failed: {text}"
            )));
        }

        response
            .json()
            .await
            .map_err(|error| GoogleSyncError::Other(error.into()))
    }

    pub async fn fetch_message(&self, gmail_msg_id: &str) -> Result<GmailMessage, GoogleSyncError> {
        let url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{gmail_msg_id}?format=full"
        );
        let response =
            crate::send_with_retry(self.client.get(&url).bearer_auth(&self.access_token))
                .await
                .map_err(|e| GoogleSyncError::Other(e.into()))?;

        if let Some(rate_limit) = check_rate_limit(&response) {
            return Err(rate_limit);
        }

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(GoogleSyncError::Other(anyhow::anyhow!(
                "GET message {} failed ({}): {}",
                gmail_msg_id,
                status,
                text
            )));
        }

        response
            .json()
            .await
            .map_err(|e| GoogleSyncError::Other(e.into()))
    }

    pub async fn download_attachment(
        &self,
        message_id: &str,
        attachment_id: &str,
    ) -> Result<Vec<u8>, GoogleSyncError> {
        let url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}/attachments/{attachment_id}"
        );

        let response =
            crate::send_with_retry(self.client.get(&url).bearer_auth(&self.access_token))
                .await
                .map_err(|e| GoogleSyncError::Other(e.into()))?;

        if let Some(rate_limit) = check_rate_limit(&response) {
            return Err(rate_limit);
        }

        if !response.status().is_success() {
            return Err(GoogleSyncError::Other(anyhow::anyhow!(
                "Attachment download failed: {}",
                response.status()
            )));
        }

        let body: AttachmentResponse = response
            .json()
            .await
            .map_err(|e| GoogleSyncError::Other(e.into()))?;
        let data = body
            .data
            .ok_or_else(|| GoogleSyncError::Other(anyhow::anyhow!("No attachment data")))?;
        decode_base64url(&data)
            .ok_or_else(|| GoogleSyncError::Other(anyhow::anyhow!("Base64 decode failed")))
    }

    pub async fn get_profile(&self) -> Result<GmailProfile, GoogleSyncError> {
        let url = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
        let response = crate::send_with_retry(self.client.get(url).bearer_auth(&self.access_token))
            .await
            .map_err(|e| GoogleSyncError::Other(e.into()))?;
        if let Some(rate_limit) = check_rate_limit(&response) {
            return Err(rate_limit);
        }
        if !response.status().is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(GoogleSyncError::Other(anyhow::anyhow!(
                "Gmail get profile failed: {text}"
            )));
        }
        response
            .json()
            .await
            .map_err(|e| GoogleSyncError::Other(e.into()))
    }

    pub async fn list_history(
        &self,
        start_history_id: &str,
        page_token: Option<&str>,
    ) -> Result<HistoryListResponse, GoogleSyncError> {
        let mut url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId={start_history_id}&maxResults=500"
        );
        if let Some(token) = page_token {
            url.push_str(&format!("&pageToken={token}"));
        }
        let response =
            crate::send_with_retry(self.client.get(&url).bearer_auth(&self.access_token))
                .await
                .map_err(|e| GoogleSyncError::Other(e.into()))?;
        if let Some(rate_limit) = check_rate_limit(&response) {
            return Err(rate_limit);
        }
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(GoogleSyncError::HistoryExpired);
        }
        if !response.status().is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(GoogleSyncError::Other(anyhow::anyhow!(
                "Gmail list history failed: {text}"
            )));
        }
        response
            .json()
            .await
            .map_err(|e| GoogleSyncError::Other(e.into()))
    }

    /// Send an email via Gmail API. Builds RFC 2822 MIME, base64url-encodes,
    /// and POSTs to /messages/send.
    pub async fn send_message(&self, draft: MailDraft) -> Result<SendResult, GoogleSyncError> {
        use base64::engine::{general_purpose::URL_SAFE_NO_PAD, Engine};

        let raw_message = build_raw_message(&draft);
        let encoded = URL_SAFE_NO_PAD.encode(raw_message.as_bytes());

        let url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

        let response = crate::send_with_retry(
            self.client
                .post(url)
                .bearer_auth(&self.access_token)
                .json(&serde_json::json!({ "raw": encoded })),
        )
        .await
        .map_err(|e| GoogleSyncError::Other(e.into()))?;

        if let Some(rate_limit) = check_rate_limit(&response) {
            return Err(rate_limit);
        }

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(GoogleSyncError::Other(anyhow::anyhow!(
                "Gmail send failed ({status}): {text}"
            )));
        }

        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct SendResponse {
            id: String,
            thread_id: Option<String>,
        }

        let resp: SendResponse = response
            .json()
            .await
            .map_err(|e| GoogleSyncError::Other(e.into()))?;
        Ok(SendResult {
            message_id: resp.id,
            thread_id: resp.thread_id,
        })
    }

    /// Bootstrap/backward page fetch — mirrors the in-backend
    /// `fetch_message_page`. Returns `(envelopes, next_cursor, has_more)` where
    /// each envelope is `{ surface, payload, remote_id }` ready for the Sync
    /// Fetch `messages.get` for each id with bounded concurrency
    /// (`GMAIL_FETCH_CONCURRENCY`), preserving order, and turn each into a
    /// `snapshot` envelope. Non-fatal fetch/convert errors skip that message;
    /// a fatal error (auth / rate-limit / history-expired) aborts the batch.
    /// Shared by bootstrap (`fetch_message_page`) and catch-up
    /// (`fetch_history_changes`).
    async fn fetch_snapshot_envelopes(
        &self,
        ids: &[String],
    ) -> Result<Vec<Value>, GoogleSyncError> {
        let fetched: Vec<(String, Result<GmailMessage, GoogleSyncError>)> =
            futures::stream::iter(ids.to_vec())
                .map(|id| async move {
                    let res = self.fetch_message(&id).await;
                    (id, res)
                })
                .buffered(GMAIL_FETCH_CONCURRENCY)
                .collect()
                .await;
        snapshot_envelopes_from_fetched(fetched)
    }

    /// Profile result. Head-first watermark: on the first page (no `page_token`)
    /// it captures `historyId` + `messagesTotal` via `get_profile()` BEFORE
    /// pagination. Returns `(envelopes, next_cursor, has_more, total, discovered)`
    /// where `total`/`discovered` drive the universal sync-progress bar (DEC-4):
    /// `total` is the page-1 `messagesTotal` threaded forward in the cursor so
    /// every page re-reports it (anti-flicker, INV-7), and `discovered` is the
    /// cumulative count of messages enumerated so far (INV-2), via
    /// [`crate::progress::progress_cursor`].
    pub async fn fetch_message_page(
        &self,
        cursor: Option<&Value>,
    ) -> Result<(Vec<Value>, Option<Value>, bool, Option<u64>, u64), GoogleSyncError> {
        let page_token = cursor
            .and_then(|c| c.get("page_token"))
            .and_then(|v| v.as_str());

        // `get_profile()` runs ONLY on the first page (no page_token): it captures
        // both `historyId` (the catchup watermark) and `messagesTotal` (the
        // bootstrap total). Pages 2+ read both forward from the cursor (DEC-4).
        let (history_id, fresh_total) = if page_token.is_none() {
            let profile = self.get_profile().await?;
            (Some(profile.history_id), profile.messages_total)
        } else {
            (
                cursor
                    .and_then(|c| c.get("history_id"))
                    .and_then(|v| v.as_str())
                    .map(String::from),
                None,
            )
        };

        let page = self.list_messages_page(page_token).await?;

        // Hydrate the page's messages with bounded concurrency (was 50 sequential
        // `messages.get` round-trips → now ~⌈50/N⌉). Order + skip/fatal semantics
        // are preserved by `snapshot_envelopes_from_fetched`.
        let ids: Vec<String> = page
            .messages
            .unwrap_or_default()
            .iter()
            .map(|m| m.id.clone())
            .collect();
        let page_len = ids.len();
        let envelopes = self.fetch_snapshot_envelopes(&ids).await?;

        // Cumulative discovered + total threaded forward (anti-flicker, INV-2/7).
        let progress = crate::progress::progress_cursor(cursor, page_len, fresh_total);

        let has_more = page.next_page_token.is_some();
        let next_cursor = if let Some(ref token) = page.next_page_token {
            let mut c = json!({ "page_token": token });
            if let Some(ref hid) = history_id {
                c["history_id"] = json!(hid);
            }
            progress.merge_into(&mut c);
            Some(c)
        } else {
            let mut c = json!({});
            if let Some(ref hid) = history_id {
                c["history_id"] = json!(hid);
            }
            progress.merge_into(&mut c);
            Some(c)
        };

        Ok((
            envelopes,
            next_cursor,
            has_more,
            progress.total,
            progress.discovered,
        ))
    }

    /// CatchUp/forward incremental fetch via the Gmail History API — mirrors the
    /// in-backend `fetch_history_changes`. A missing `history_id` in the cursor
    /// is a `HistoryExpired` (cursor-expired) error, never silently re-bootstrapped.
    ///
    /// Returns `(envelopes, next_cursor, has_more, total, discovered)`. Catchup
    /// MUST carry the bootstrap `discovered`/`total` FORWARD from the cursor and
    /// never emit `discovered: 0` (INV-8) — a fresh forward cycle that reset the
    /// count would visually wipe the bootstrap progress on the live WS path.
    pub async fn fetch_history_changes(
        &self,
        cursor: Option<&Value>,
    ) -> Result<(Vec<Value>, Option<Value>, bool, Option<u64>, u64), GoogleSyncError> {
        let history_id = cursor
            .and_then(|c| c.get("history_id"))
            .and_then(|v| v.as_str())
            .ok_or(GoogleSyncError::HistoryExpired)?;

        let history_page_token = cursor
            .and_then(|c| c.get("history_page_token"))
            .and_then(|v| v.as_str());

        let history_resp = self.list_history(history_id, history_page_token).await?;
        let actions = resolve_history_actions(&history_resp.history);

        // Delete actions are synchronous; Fetch actions are hydrated with bounded
        // concurrency via the shared helper (was sequential per-message).
        let mut envelopes: Vec<Value> = actions
            .iter()
            .filter(|(_, action)| matches!(action, HistoryAction::Delete))
            .map(|(msg_id, _)| {
                json!({
                    "surface": "email",
                    "payload": {},
                    "remote_id": msg_id,
                    "kind": "delete",
                })
            })
            .collect();
        let fetch_ids: Vec<String> = actions
            .iter()
            .filter(|(_, action)| matches!(action, HistoryAction::Fetch))
            .map(|(msg_id, _)| msg_id.clone())
            .collect();
        envelopes.extend(self.fetch_snapshot_envelopes(&fetch_ids).await?);

        // Carry bootstrap progress FORWARD (INV-8): a catchup cycle reports the
        // SAME cumulative `discovered`/`total` the bootstrap left in the cursor
        // (page_len 0 → no increment), so the live WS bar is not wiped to 0.
        let progress = crate::progress::progress_cursor(cursor, 0, None);

        let has_more = history_resp.next_page_token.is_some();
        let mut next_cursor = if let Some(ref token) = history_resp.next_page_token {
            json!({ "history_id": history_id, "history_page_token": token })
        } else {
            json!({ "history_id": history_resp.history_id })
        };
        progress.merge_into(&mut next_cursor);

        Ok((
            envelopes,
            Some(next_cursor),
            has_more,
            progress.total,
            progress.discovered,
        ))
    }
}

/// Turn the (id, fetch-result) pairs produced by `fetch_snapshot_envelopes`
/// into `snapshot` envelopes, in order. A non-fatal fetch error (`Other`) or a
/// conversion failure SKIPS that message (logged). A fatal fetch error
/// (`AuthExpired` / `RateLimited` / `HistoryExpired`) aborts and propagates —
/// identical semantics to the old sequential loop, now decoupled from the I/O so
/// it is unit-testable.
fn snapshot_envelopes_from_fetched(
    fetched: Vec<(String, Result<GmailMessage, GoogleSyncError>)>,
) -> Result<Vec<Value>, GoogleSyncError> {
    let mut envelopes = Vec::new();
    for (id, res) in fetched {
        let full_msg = match res {
            Ok(msg) => msg,
            // Non-fatal (transient / other) — skip this one message.
            Err(GoogleSyncError::Other(e)) => {
                eprintln!("magnis-google: skipping message {id} (fetch failed: {e})");
                continue;
            }
            // Fatal — auth expiry / rate limit / history expiry — abort the batch.
            Err(e) => return Err(e),
        };

        match gmail_message_to_mail_message(&full_msg) {
            Ok(mail_message) => {
                let mut payload = serde_json::to_value(&mail_message)
                    .map_err(|e| GoogleSyncError::Other(e.into()))?;
                flatten_mail_payload(&mut payload);
                envelopes.push(json!({
                    "surface": "email",
                    "payload": payload,
                    "remote_id": id,
                    "kind": "snapshot",
                }));
            }
            Err(e) => {
                eprintln!("magnis-google: skipping message {id} (convert failed: {e})");
            }
        }
    }
    Ok(envelopes)
}

// ── GmailMessage → MailMessage conversion (ported) ───────────

pub fn gmail_message_to_mail_message(msg: &GmailMessage) -> Result<MailMessage> {
    let payload = msg
        .payload
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("message {} has no payload", msg.id))?;

    let headers = payload.headers.as_deref().unwrap_or(&[]);

    let subject = get_header(headers, "Subject").unwrap_or_default();
    let from_raw = get_header(headers, "From").unwrap_or_default();
    let to_raw = get_header(headers, "To").unwrap_or_default();
    let cc_raw = get_header(headers, "Cc").unwrap_or_default();
    let bcc_raw = get_header(headers, "Bcc").unwrap_or_default();
    let date_raw = get_header(headers, "Date");
    let message_id_header =
        get_header(headers, "Message-ID").or_else(|| get_header(headers, "Message-Id"));

    let from = parse_email_address(&from_raw);
    let to = parse_email_addresses(&to_raw);
    let cc = parse_email_addresses(&cc_raw);
    let bcc = parse_email_addresses(&bcc_raw);

    let sent_at = date_raw
        .as_deref()
        .and_then(parse_rfc2822_date)
        .or_else(|| {
            msg.internal_date
                .as_deref()
                .and_then(internal_date_to_datetime)
        })
        .unwrap_or_default();

    let labels = msg.label_ids.clone().unwrap_or_default();
    let is_read = !labels.iter().any(|l| l == "UNREAD");
    let is_starred = labels.iter().any(|l| l == "STARRED");

    let snippet = msg.snippet.clone().unwrap_or_default();
    let body = extract_body_content(payload);
    let attachments_info = collect_attachments(payload);

    let attachments: Vec<MailAttachment> = attachments_info
        .iter()
        .map(|a| MailAttachment {
            attachment_id: a.attachment_id.clone(),
            filename: a.filename.clone(),
            mime_type: a.mime_type.clone(),
            size: a.size,
        })
        .collect();

    let body_text = body.body_text.filter(|v| !v.trim().is_empty()).or_else(|| {
        let s = snippet.trim();
        (!s.is_empty()).then(|| s.to_string())
    });

    Ok(MailMessage {
        id: msg.id.clone(),
        thread_id: msg.thread_id.clone(),
        message_id_header,
        subject,
        from,
        to,
        cc,
        bcc,
        sent_at,
        snippet,
        body_text,
        body_html: body.body_html,
        labels,
        is_read,
        is_starred,
        has_attachments: !attachments.is_empty(),
        attachments,
    })
}

fn get_header(headers: &[GmailHeader], name: &str) -> Option<String> {
    headers
        .iter()
        .find(|h| h.name.eq_ignore_ascii_case(name))
        .map(|h| h.value.clone())
}

fn parse_email_address(raw: &str) -> EmailAddress {
    if let Some(lt) = raw.find('<') {
        if let Some(gt) = raw.find('>') {
            let name = raw[..lt].trim().trim_matches('"').to_string();
            let address = raw[lt + 1..gt].trim().to_string();
            return EmailAddress {
                name: if name.is_empty() { None } else { Some(name) },
                address,
            };
        }
    }
    EmailAddress {
        name: None,
        address: raw.trim().to_string(),
    }
}

fn parse_email_addresses(raw: &str) -> Vec<EmailAddress> {
    raw.split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(parse_email_address)
        .collect()
}

fn parse_rfc2822_date(raw: &str) -> Option<DateTime<chrono::Utc>> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc2822(raw) {
        return Some(dt.with_timezone(&chrono::Utc));
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(raw) {
        return Some(dt.with_timezone(&chrono::Utc));
    }
    None
}

fn internal_date_to_datetime(millis_str: &str) -> Option<DateTime<chrono::Utc>> {
    let millis: i64 = millis_str.parse().ok()?;
    DateTime::from_timestamp_millis(millis)
}

// ── flatten_mail_payload (ported byte-identically) ───────────

/// Flatten MailMessage payload: extract `from` → `from_name`/`from_address`,
/// and `to`/`cc`/`bcc` arrays → comma-separated `*_addresses` strings. This is
/// THE email payload shape the `emails` module ingests. Replicated exactly from
/// the in-backend Gmail runtime.
pub fn flatten_mail_payload(payload: &mut Value) {
    if let Some(obj) = payload.as_object_mut() {
        if let Some(from) = obj.remove("from") {
            obj.insert(
                "from_name".to_string(),
                from.get("name").cloned().unwrap_or(Value::Null),
            );
            obj.insert(
                "from_address".to_string(),
                from.get("address").cloned().unwrap_or(Value::Null),
            );
        }
        // Flatten to/cc/bcc arrays into comma-separated strings.
        for field in ["to", "cc", "bcc"] {
            if let Some(arr) = obj.get(field).and_then(|v| v.as_array()) {
                let addrs: Vec<String> = arr
                    .iter()
                    .filter_map(|v| v.get("address").and_then(|a| a.as_str()))
                    .map(String::from)
                    .collect();
                let key = format!("{field}_addresses");
                obj.insert(key, Value::String(addrs.join(", ")));
                obj.remove(field);
            }
        }
    }
}

// ── History action resolution (ported) ───────────────────────

/// Resolved action for a message from Gmail History API.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum HistoryAction {
    /// Message was added or labels changed — fetch full message.
    Fetch,
    /// Message was deleted — emit Delete envelope, no fetch needed.
    Delete,
}

/// Resolve the last effective action per message across history entries.
///
/// - Entries are chronologically ordered by historyId.
/// - Within a single entry, Gmail does NOT guarantee field order. If a message
///   appears in both `messagesAdded` and `messagesDeleted` within one entry,
///   `Deleted` wins.
/// - Across entries, later entries override earlier ones.
/// - `labelsChanged` only applies if the message wasn't also added/deleted.
pub fn resolve_history_actions(entries: &[HistoryEntry]) -> BTreeMap<String, HistoryAction> {
    let mut actions: BTreeMap<String, HistoryAction> = BTreeMap::new();

    for entry in entries {
        let mut entry_added = BTreeSet::new();
        let mut entry_deleted = BTreeSet::new();
        let mut entry_labels = BTreeSet::new();

        for ev in &entry.messages_added {
            entry_added.insert(ev.message.id.clone());
        }
        for ev in &entry.messages_deleted {
            entry_deleted.insert(ev.message.id.clone());
        }
        for ev in &entry.labels_added {
            entry_labels.insert(ev.message.id.clone());
        }
        for ev in &entry.labels_removed {
            entry_labels.insert(ev.message.id.clone());
        }

        // Within-entry: Deleted wins over Added if both present.
        // Across entries: this entry overwrites earlier entries.
        for id in &entry_deleted {
            actions.insert(id.clone(), HistoryAction::Delete);
        }
        for id in &entry_added {
            if !entry_deleted.contains(id) {
                actions.insert(id.clone(), HistoryAction::Fetch);
            }
        }
        for id in &entry_labels {
            if !entry_deleted.contains(id) && !entry_added.contains(id) {
                actions.entry(id.clone()).or_insert(HistoryAction::Fetch);
            }
        }
    }

    actions
}

// ── RFC 2822 message builder (ported) ────────────────────────

/// Wrap a string in MIME encoded-word (RFC 2047) if it contains any
/// non-ASCII bytes. ASCII strings are returned unchanged so the wire
/// stays human-readable. Without this wrapper, raw UTF-8 in a header
/// field is invalid per RFC 5322 — receiving servers store the bytes
/// and different views (Gmail Web UI, Gmail API `format=full`, the
/// IMAP raw fetch) apply different fallback decodings, producing
/// mojibake (e.g. "Привет," becomes "Ã ÂŸÃ‘Â€Ã ¸Ã ²Ã µÃ‘Â,").
fn mime_encode_header(value: &str) -> String {
    if value.is_ascii() {
        return value.to_string();
    }
    use base64::engine::{general_purpose::STANDARD, Engine};
    format!("=?UTF-8?B?{}?=", STANDARD.encode(value.as_bytes()))
}

/// Format a display name + address pair for a To/Cc/Bcc/From header.
/// The display name is MIME-encoded when non-ASCII; the address is
/// always ASCII per SMTP rules so it stays bare.
fn format_recipient(name: Option<&str>, address: &str) -> String {
    match name {
        Some(name) if !name.is_empty() => format!("{} <{}>", mime_encode_header(name), address),
        _ => address.to_string(),
    }
}

/// Build a raw RFC 2822 message from a MailDraft.
///
/// - Without attachments: simple text/plain message.
/// - With attachments: multipart/mixed with text part + base64-encoded
///   attachment parts.
/// - Non-ASCII Subject + display names are MIME-encoded per RFC 2047
///   so receiving servers (Gmail) don't store raw UTF-8 bytes in
///   header fields and end up serving mojibake to readers.
pub fn build_raw_message(draft: &MailDraft) -> String {
    use base64::engine::{general_purpose::STANDARD, Engine};

    let to_str = draft
        .to
        .iter()
        .map(|a| format_recipient(a.name.as_deref(), &a.address))
        .collect::<Vec<_>>()
        .join(", ");

    let cc_str = draft
        .cc
        .iter()
        .map(|a| format_recipient(a.name.as_deref(), &a.address))
        .collect::<Vec<_>>()
        .join(", ");

    let mut headers = vec![
        format!("To: {to_str}"),
        format!("Subject: {}", mime_encode_header(&draft.subject)),
        "MIME-Version: 1.0".to_string(),
    ];

    if !cc_str.is_empty() {
        headers.push(format!("Cc: {cc_str}"));
    }

    if let Some(ref reply_to) = draft.in_reply_to {
        headers.push(format!("In-Reply-To: {reply_to}"));
        headers.push(format!("References: {reply_to}"));
    }

    if draft.attachments.is_empty() {
        headers.push("Content-Type: text/plain; charset=UTF-8".to_string());
        format!("{}\r\n\r\n{}", headers.join("\r\n"), draft.body_text)
    } else {
        let boundary = format!("----=_Part_{}", uuid::Uuid::new_v4().simple());
        headers.push(format!(
            "Content-Type: multipart/mixed; boundary=\"{}\"",
            boundary
        ));

        let mut parts = Vec::new();

        parts.push(format!(
            "--{boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n{}",
            draft.body_text
        ));

        for att in &draft.attachments {
            let b64 = STANDARD.encode(&att.data);
            parts.push(format!(
                "--{boundary}\r\n\
                 Content-Type: {}; name=\"{}\"\r\n\
                 Content-Disposition: attachment; filename=\"{}\"\r\n\
                 Content-Transfer-Encoding: base64\r\n\
                 \r\n\
                 {}",
                att.mime_type, att.filename, att.filename, b64
            ));
        }

        parts.push(format!("--{boundary}--"));

        format!("{}\r\n\r\n{}", headers.join("\r\n"), parts.join("\r\n"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header(name: &str, value: &str) -> GmailHeader {
        GmailHeader {
            name: name.to_string(),
            value: value.to_string(),
        }
    }

    fn full_gmail_message() -> GmailMessage {
        GmailMessage {
            id: "msg_1".into(),
            thread_id: Some("thread_1".into()),
            label_ids: Some(vec!["UNREAD".into(), "STARRED".into(), "INBOX".into()]),
            snippet: Some("Hello preview".into()),
            internal_date: Some("1700000000000".into()),
            payload: Some(GmailPayload {
                mime_type: Some("text/plain".into()),
                headers: Some(vec![
                    header("Subject", "Test subject"),
                    header("From", "Alice <alice@example.com>"),
                    header("To", "Bob <bob@example.com>, carol@example.com"),
                    header("Cc", "dave@example.com"),
                    header("Bcc", ""),
                    header("Date", "Tue, 14 Nov 2023 22:13:20 +0000"),
                ]),
                body: Some(GmailBody {
                    attachment_id: None,
                    size: Some(11),
                    data: Some("SGVsbG8gd29ybGQ".into()),
                }),
                parts: None,
            }),
        }
    }

    #[test]
    fn tst_src_gmail_001_full_message_conversion() {
        let msg = full_gmail_message();
        let mail = gmail_message_to_mail_message(&msg).unwrap();

        assert_eq!(mail.id, "msg_1");
        assert_eq!(mail.thread_id.as_deref(), Some("thread_1"));
        assert_eq!(mail.subject, "Test subject");
        assert_eq!(mail.from.address, "alice@example.com");
        assert_eq!(mail.from.name.as_deref(), Some("Alice"));
        assert_eq!(mail.to.len(), 2);
        assert_eq!(mail.cc.len(), 1);
        assert!(mail.bcc.is_empty());
        assert!(!mail.is_read);
        assert!(mail.is_starred);
        assert_eq!(mail.sent_at.to_rfc3339(), "2023-11-14T22:13:20+00:00");
    }

    // tst_src_gmail_conc_002 — concurrently-fetched results become snapshot
    // envelopes IN ORDER; a non-fatal fetch error and a conversion failure (no
    // payload) are both skipped, NOT aborting the batch.
    #[test]
    fn tst_src_gmail_conc_002_skips_nonfatal_and_convert_errors() {
        let no_payload = GmailMessage {
            id: "np".into(),
            thread_id: None,
            label_ids: None,
            snippet: None,
            internal_date: None,
            payload: None,
        };
        let fetched = vec![
            ("a".to_string(), Ok(full_gmail_message())),
            (
                "b".to_string(),
                Err(GoogleSyncError::Other(anyhow::anyhow!("conn reset"))),
            ),
            ("c".to_string(), Ok(no_payload)),
            ("d".to_string(), Ok(full_gmail_message())),
        ];
        let envs = snapshot_envelopes_from_fetched(fetched).unwrap();
        // Only the two valid messages survive; order preserved (a before d).
        assert_eq!(envs.len(), 2);
        assert_eq!(envs[0]["remote_id"], "a");
        assert_eq!(envs[1]["remote_id"], "d");
        assert_eq!(envs[0]["kind"], "snapshot");
        assert_eq!(envs[0]["surface"], "email");
    }

    // tst_src_gmail_conc_003 — a FATAL fetch error (auth expiry) aborts the whole
    // batch and propagates, even when earlier messages succeeded.
    #[test]
    fn tst_src_gmail_conc_003_fatal_error_aborts() {
        let fetched = vec![
            ("a".to_string(), Ok(full_gmail_message())),
            (
                "b".to_string(),
                Err(GoogleSyncError::AuthExpired("token expired".into())),
            ),
        ];
        let res = snapshot_envelopes_from_fetched(fetched);
        assert!(matches!(res, Err(GoogleSyncError::AuthExpired(_))));
    }

    #[test]
    fn tst_src_gmail_flat_001_flatten_full_payload() {
        let mut payload = json!({
            "id": "msg_1",
            "from": {"name": "Alice", "address": "alice@x.com"},
            "to": [{"name": "Bob", "address": "bob@y.com"}],
            "cc": [{"address": "carol@z.com"}],
            "bcc": []
        });
        flatten_mail_payload(&mut payload);
        assert_eq!(payload["from_name"], "Alice");
        assert_eq!(payload["from_address"], "alice@x.com");
        assert_eq!(payload["to_addresses"], "bob@y.com");
        assert_eq!(payload["cc_addresses"], "carol@z.com");
        assert_eq!(payload["bcc_addresses"], "");
        assert!(payload.get("from").is_none());
        assert!(payload.get("to").is_none());
    }

    // tst_src_gmail_total_004 (INV-1) — `GmailProfile` deserializes a JSON body
    // with `messagesTotal` into `messages_total` (serde round-trip, no HTTP). The
    // Gmail bootstrap reports this as the determinate `total`.
    #[test]
    fn tst_src_gmail_total_004_profile_deserializes_messages_total() {
        let body = json!({
            "emailAddress": "me@example.com",
            "messagesTotal": 12345,
            "threadsTotal": 6789,
            "historyId": "987654"
        });
        let profile: GmailProfile = serde_json::from_value(body).unwrap();
        assert_eq!(profile.history_id, "987654");
        assert_eq!(
            profile.messages_total,
            Some(12345),
            "messagesTotal maps to messages_total via camelCase"
        );

        // A body WITHOUT messagesTotal still deserializes (None → indeterminate).
        let body = json!({ "historyId": "1" });
        let profile: GmailProfile = serde_json::from_value(body).unwrap();
        assert_eq!(profile.messages_total, None);
    }

    #[test]
    fn tst_src_gmail_hist_007_add_then_delete_same_entry_is_delete() {
        let entries = vec![HistoryEntry {
            messages_added: vec![HistoryMessageEvent {
                message: HistoryMessageRef {
                    id: "msg_c".into(),
                    thread_id: None,
                },
            }],
            messages_deleted: vec![HistoryMessageEvent {
                message: HistoryMessageRef {
                    id: "msg_c".into(),
                    thread_id: None,
                },
            }],
            labels_added: vec![],
            labels_removed: vec![],
        }];
        let actions = resolve_history_actions(&entries);
        assert_eq!(actions.get("msg_c"), Some(&HistoryAction::Delete));
    }
}
