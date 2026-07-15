//! Live grammers MTProto client wrapper.
//!
//! Ported from `backend/src/sources/telegram/client.rs` + `client_api.rs`, but
//! standalone: the connector builds its own grammers `Client` from the per-call
//! `_meta = { api_id, api_hash, session }` the host injects (rather than from a
//! secret store / session file on disk). Auth (phone → code → 2FA) is performed
//! elsewhere; this connector consumes an already-authorized session blob.
//!
//! NOTE: live mode is BEST-EFFORT. The fully-tested path is fixture mode
//! (`fixture.rs`) — the host-side ingest test drives the connector with
//! `TELEGRAM_FIXTURE_FILE`. The grammers wiring here mirrors the in-backend
//! source but is exercised only against real Telegram.

use std::collections::HashMap;
use std::sync::Arc;

use base64::Engine;
use grammers_client::grammers_tl_types as tl;
use grammers_client::types::{Chat, Media, Message};
use grammers_client::{ChatMap, Client, Config, InitParams, InputMessage};
use grammers_session::{PackedChat, PackedType, Session};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Mutex;

use crate::envelope::{TgChat, TgMessage, TgSenderInfo};

/// Per-chat message hydration depth during bootstrap. Each enumerated dialog's
/// newest `N` messages are fetched via `iter_messages` (the dialog list itself
/// only carries each chat's single top message), preserving the snapshot the
/// in-backend bootstrap produced.
pub(crate) const BOOTSTRAP_MESSAGES_PER_CHAT: usize = 50;

/// Upper bound (seconds) on a Telegram FLOOD_WAIT the send path absorbs inline via
/// wait+retry (DEC-2/INV-3). A FloodWait at or below this is slept-through and the
/// send retried once (the message still goes out); a longer one is surfaced as a
/// typed rate-limit (`RATE_LIMITED:{secs}`) up the command channel so the host can
/// schedule the backoff rather than the connector blocking for minutes.
pub(crate) const FLOOD_WAIT_RETRY_MAX: u64 = 30;

/// Sentinel prefix carried up the `anyhow`/`Result<_, String>` command channel for
/// a FLOOD_WAIT longer than [`FLOOD_WAIT_RETRY_MAX`]. `main.rs::classify_tool_error`
/// recognizes it → JSON-RPC code `-32002` + `data: { retry_after: secs }`; the host
/// MCP runtime then maps it to `SourceError::RateLimit`.
pub(crate) const RATE_LIMITED_PREFIX: &str = "RATE_LIMITED:";

/// If `err` is a Telegram FLOOD_WAIT, return its wait in seconds. Mirrors the
/// detection in [`history_error_is_fatal`] (grammers surfaces a flood-wait as an
/// `InvocationError::Rpc` with code 420 and/or a `FLOOD_WAIT*` name; the seconds
/// arrive in the `RpcError.value` field, e.g. `FLOOD_WAIT_31` → `value = Some(31)`).
pub(crate) fn flood_wait_secs(err: &anyhow::Error) -> Option<u32> {
    use grammers_client::InvocationError;
    match err.downcast_ref::<InvocationError>() {
        Some(InvocationError::Rpc(rpc))
            if rpc.code == 420 || rpc.name.starts_with("FLOOD_WAIT") =>
        {
            rpc.value
        }
        _ => None,
    }
}

/// FLOOD_WAIT-aware send wrapper (DEC-2). Generic over the actual send (so the
/// live grammers call and a test fake share ONE policy) and over the sleeper (so
/// tests don't wait real seconds):
///
/// - send succeeds → return the result.
/// - send fails with a FLOOD_WAIT of `secs ≤ FLOOD_WAIT_RETRY_MAX` → `sleep(secs)`,
///   then retry the send ONCE. If that retry succeeds → return it; if it fails →
///   return the (rate-limit or other) error from the retry.
/// - send fails with a FLOOD_WAIT of `secs > FLOOD_WAIT_RETRY_MAX` → return
///   `Err(RATE_LIMITED:{secs})` immediately (no blocking).
/// - any other error → propagated unchanged.
pub(crate) async fn send_with_flood_retry<S, SFut, Z, ZFut>(
    mut send: S,
    sleep: Z,
) -> anyhow::Result<Value>
where
    S: FnMut() -> SFut,
    SFut: std::future::Future<Output = anyhow::Result<Value>>,
    Z: FnOnce(u64) -> ZFut,
    ZFut: std::future::Future<Output = ()>,
{
    match send().await {
        Ok(v) => Ok(v),
        Err(err) => match flood_wait_secs(&err) {
            Some(secs) if (secs as u64) <= FLOOD_WAIT_RETRY_MAX => {
                sleep(secs as u64).await;
                send().await
            }
            Some(secs) => Err(anyhow::anyhow!("{RATE_LIMITED_PREFIX}{secs}")),
            None => Err(err),
        },
    }
}

/// Credentials injected per call by the host under `_meta`.
pub struct TgCreds {
    pub api_id: i32,
    pub api_hash: String,
    /// base64 of the serialized grammers session blob.
    pub session: String,
}

/// Pull `{ api_id, api_hash, session }` out of the tool-call `_meta`. All three
/// are required — a missing key is an error (NO FALLBACK).
pub fn creds_from_meta(args: &Value) -> Result<TgCreds, String> {
    let meta = args
        .get("_meta")
        .ok_or_else(|| "missing _meta with Telegram credentials".to_string())?;
    let api_id = meta
        .get("api_id")
        .and_then(|v| {
            v.as_i64()
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        })
        .filter(|n| *n > 0)
        .ok_or_else(|| "missing or invalid credential 'api_id' in _meta".to_string())?
        as i32;
    let api_hash = meta
        .get("api_hash")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "missing credential 'api_hash' in _meta".to_string())?;
    let session = meta
        .get("session")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "missing credential 'session' in _meta".to_string())?;
    Ok(TgCreds {
        api_id,
        api_hash,
        session,
    })
}

/// Pull the required `account_id` out of the tool-call `_meta`. The host
/// always injects it (`TelegramCredentialProvider`); a missing or empty
/// value is an error (NO FALLBACK) so a caller never silently collapses
/// every account's session to `""`. Shared by `main`, `tools`, and
/// `subscriptions` — one definition, one behaviour.
pub fn account_id_from_meta(args: &Value) -> Result<String, String> {
    args.get("_meta")
        .and_then(|m| m.get("account_id"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "missing required _meta.account_id".to_string())
}

/// A connected grammers client + a peer cache for resolving chat ids.
#[derive(Clone)]
pub struct TgClient {
    pub client: Client,
    pub peer_cache: Arc<Mutex<HashMap<i64, PackedChat>>>,
}

impl TgClient {
    /// Connect to Telegram from the injected credentials. The session blob is
    /// base64-decoded and loaded; the client must already be authorized.
    pub async fn connect(creds: &TgCreds) -> anyhow::Result<Self> {
        let session_bytes = base64::engine::general_purpose::STANDARD
            .decode(&creds.session)
            .map_err(|e| anyhow::anyhow!("invalid base64 session: {e}"))?;
        let session = Session::load(&session_bytes)
            .map_err(|e| anyhow::anyhow!("failed to load grammers session: {e}"))?;

        let init_params = InitParams {
            device_model: "Magnis".to_string(),
            system_version: "1.0".to_string(),
            app_version: "0.1.0".to_string(),
            system_lang_code: "en".to_string(),
            lang_code: "en".to_string(),
            ..Default::default()
        };

        let client = Client::connect(Config {
            session,
            api_id: creds.api_id,
            api_hash: creds.api_hash.clone(),
            params: init_params,
        })
        .await
        .map_err(|e| anyhow::anyhow!("failed to connect to Telegram: {e}"))?;

        Ok(Self {
            client,
            peer_cache: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub async fn resolve_packed_chat(&self, chat_id: i64) -> anyhow::Result<PackedChat> {
        {
            let cache = self.peer_cache.lock().await;
            if let Some(packed) = cache.get(&chat_id).copied() {
                return Ok(packed);
            }
        }
        let mut dialogs = self.client.iter_dialogs();
        while let Some(dialog) = dialogs.next().await? {
            let chat = dialog.chat();
            let packed = chat.pack();
            let id = chat.id();
            self.peer_cache.lock().await.insert(id, packed);
            if id == chat_id {
                return Ok(packed);
            }
        }
        Err(anyhow::anyhow!("chat {chat_id} not found in any dialog"))
    }

    pub async fn send_message(
        &self,
        chat_id: i64,
        text: &str,
        reply_to_message_id: Option<i64>,
    ) -> anyhow::Result<Value> {
        let packed = self.resolve_packed_chat(chat_id).await?;
        // DEC-2: wrap the live send in the FLOOD_WAIT-aware retry seam. A short
        // FloodWait (≤ FLOOD_WAIT_RETRY_MAX) is absorbed via wait+retry (the
        // message still sends); a longer one surfaces the `RATE_LIMITED:{secs}`
        // sentinel up the anyhow channel (the connector does NOT block).
        send_with_flood_retry(
            || async {
                let mut input = InputMessage::text(text);
                if let Some(reply_id) = reply_to_message_id {
                    input = input.reply_to(Some(reply_id as i32));
                }
                let msg = self.client.send_message(packed, input).await?;
                Ok(serde_json::json!({
                    "message_id": msg.id() as i64,
                    "chat_id": chat_id,
                    "text": text,
                    "schema_id": "telegram.message",
                }))
            },
            |secs| async move { tokio::time::sleep(std::time::Duration::from_secs(secs)).await },
        )
        .await
    }

    /// Download the media of a single message to `dest` (an absolute path on the
    /// shared host filesystem) and return the bytes written. Mirrors the native
    /// source's `download_file` (sources/telegram/runtime.rs): the host
    /// FileService worker drives it via `execute { action: "download_file" }`.
    pub async fn download_media_file(
        &self,
        chat_id: i64,
        message_id: i64,
        dest: &std::path::Path,
    ) -> anyhow::Result<u64> {
        let packed = self.resolve_packed_chat(chat_id).await?;
        let messages = self
            .client
            .get_messages_by_id(packed, &[message_id as i32])
            .await?;
        let message = messages.into_iter().flatten().next().ok_or_else(|| {
            anyhow::anyhow!("download_file: message {message_id} not found in chat {chat_id}")
        })?;
        if let Some(parent) = dest.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let downloaded = message.download_media(dest).await?;
        if !downloaded {
            anyhow::bail!("download_file: no downloadable media in message {message_id}");
        }
        Ok(tokio::fs::metadata(dest).await?.len())
    }
}

// ---------------------------------------------------------------------------
// Dialog pagination seam (DEC-8). The bootstrap loop in `commands.rs` is generic
// over `DialogPager` so it can be unit-tested with an in-memory fake; the LIVE
// impl below resumes `messages.getDialogs` from a persisted offset (DEC-1/2),
// replacing the O(N²) `iter_dialogs()`-from-top re-walk.
// ---------------------------------------------------------------------------

/// Serializable dialog-list pagination offset persisted in the bootstrap cursor
/// under `dialog_offset`. Mirrors the `messages.getDialogs` offset triple so the
/// next batch resumes where the last one stopped instead of re-walking from the
/// top. `offset_date`/`offset_id` are TL `int`; the peer carries a nullable
/// `access_hash` (basic groups / `min` users have none).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct DialogOffset {
    pub offset_date: i32,
    pub offset_id: i32,
    pub offset_peer: OffsetPeer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct OffsetPeer {
    /// `"user"` | `"chat"` | `"channel"` — the InputPeer category.
    pub ty: String,
    pub id: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access_hash: Option<i64>,
}

impl OffsetPeer {
    fn from_packed(packed: PackedChat) -> Self {
        let ty = match packed.ty {
            PackedType::User | PackedType::Bot => "user",
            PackedType::Chat => "chat",
            PackedType::Megagroup | PackedType::Broadcast | PackedType::Gigagroup => "channel",
        };
        Self {
            ty: ty.to_string(),
            id: packed.id,
            access_hash: packed.access_hash,
        }
    }

    /// Rebuild the `InputPeer` for the next `GetDialogs` call by reconstructing a
    /// `PackedChat` and reusing its (correct) `to_input_peer`.
    fn to_input_peer(&self) -> tl::enums::InputPeer {
        let ty = match self.ty.as_str() {
            "user" => PackedType::User,
            "channel" => PackedType::Broadcast,
            _ => PackedType::Chat,
        };
        PackedChat {
            ty,
            id: self.id,
            access_hash: self.access_hash,
        }
        .to_input_peer()
    }
}

/// Whether a per-chat `messages.getHistory` error is FATAL (must abort the
/// bootstrap batch and surface to the host) versus TRANSIENT (skip this one
/// chat's history and continue — the chat itself is still discovered).
///
/// Mirrors the gmail snapshot helper's "skip non-fatal, propagate fatal" split
/// (`gmail.rs::snapshot_envelopes_from_fetched`) and the connector's existing
/// auth classification (`main.rs::classify_tool_error`, RPC code 401):
///
/// - FATAL (return `true`): a grammers `Rpc` error with code 401 — auth/session
///   failure (`AUTH_KEY_UNREGISTERED`, `SESSION_REVOKED`, `USER_DEACTIVATED`).
///   Silently skipping these would let a dead session masquerade as a chat with
///   no history. Flood-wait (code 420 / `FLOOD_WAIT_*`) is also fatal here: it
///   needs the host's retry/backoff scheduling, not a per-chat swallow.
/// - TRANSIENT (return `false`): everything else — a server-side `RPC_CALL_FAIL`
///   (code 500, the real-world `getHistory` 500 that aborted bootstrap at
///   1954/2581), other 5xx, `Dropped`, `Read`, or any non-grammers error. A
///   later sync cycle re-attempts the skipped chat's history.
pub(crate) fn history_error_is_fatal(err: &anyhow::Error) -> bool {
    use grammers_client::InvocationError;
    match err.downcast_ref::<InvocationError>() {
        Some(InvocationError::Rpc(rpc)) => {
            // 401: auth/session is dead — must surface (do NOT silently swallow).
            // 420 / FLOOD_WAIT_*: needs host-level backoff, not a per-chat skip.
            rpc.code == 401 || rpc.code == 420 || rpc.name.starts_with("FLOOD_WAIT")
        }
        // Dropped / Read (connection-level) and non-grammers errors are treated
        // as transient: skip this chat's history, a later cycle re-attempts.
        _ => false,
    }
}

/// One enumerated dialog with its chat snapshot + hydrated message snapshots,
/// already converted to the canonical intermediates. `pin_order` on `chat` is a
/// placeholder (0) — the bootstrap loop assigns the authoritative running order.
pub(crate) struct PagedDialog {
    pub chat: TgChat,
    pub messages: Vec<TgMessage>,
}

/// Resolve a single dialog's per-chat history-hydration result into the messages
/// to attach to its [`PagedDialog`]. Decoupled from the grammers I/O (the caller
/// fetches into a `Result`) so the skip/propagate policy is unit-testable —
/// identical in spirit to `gmail.rs::snapshot_envelopes_from_fetched`.
///
/// - `Ok(messages)` → attach them.
/// - `Err(transient)` → log with the chat id and return `Ok(vec![])`: the chat is
///   STILL discovered (its `chat` envelope is emitted), only its history snapshot
///   is skipped, and the bootstrap batch continues. This is the fix for a single
///   chat's `RPC_CALL_FAIL` (server 500) aborting the whole bootstrap.
/// - `Err(fatal)` → propagate (auth / flood-wait): the batch aborts and the host
///   surfaces a typed error.
pub(crate) fn resolve_hydrated_messages(
    chat_id: i64,
    fetched: anyhow::Result<Vec<TgMessage>>,
) -> anyhow::Result<Vec<TgMessage>> {
    match fetched {
        Ok(messages) => Ok(messages),
        Err(err) if history_error_is_fatal(&err) => Err(err),
        Err(err) => {
            eprintln!(
                "magnis-telegram: skipping history for chat {chat_id} \
                 (getHistory failed, transient — chat still discovered): {err}"
            );
            Ok(Vec::new())
        }
    }
}

/// One page of the dialog list. `next_offset = None` means the walk is exhausted
/// (the loop reports `hasMore=false` and the host transitions to CatchUp).
/// `total` is the server's estimate of the FULL dialog count
/// (`messages.dialogsSlice.count`) — surfaced to the host for a sync-progress
/// bar (DEC-2/5). The non-slice `Dialogs` variant (complete list) carries no
/// count → `total = dialogs.len()` (INV-2). `None` only when the pager does not
/// report one (test fakes that opt out).
pub(crate) struct DialogPage {
    pub dialogs: Vec<PagedDialog>,
    pub next_offset: Option<DialogOffset>,
    pub total: Option<i64>,
}

/// Fetches one page of dialogs starting at `offset` (None = from the top). The
/// LIVE impl talks to Telegram; the test fake serves an in-memory list.
#[allow(async_fn_in_trait)]
pub(crate) trait DialogPager {
    async fn dialog_page(
        &self,
        offset: Option<&DialogOffset>,
        limit: usize,
    ) -> anyhow::Result<DialogPage>;
}

/// Live `DialogPager` over a connected grammers client.
pub(crate) struct LiveDialogPager<'a> {
    pub client: &'a TgClient,
    pub account_id: &'a str,
}

impl DialogPager for LiveDialogPager<'_> {
    async fn dialog_page(
        &self,
        offset: Option<&DialogOffset>,
        limit: usize,
    ) -> anyhow::Result<DialogPage> {
        // Pinned dialogs are returned at the head of the FIRST page only;
        // `exclude_pinned` after page 1 mirrors grammers (`dialogs.rs:115`) and
        // prevents Telegram re-returning them on every page (dup chats / count).
        let (offset_date, offset_id, offset_peer) = match offset {
            Some(o) => (o.offset_date, o.offset_id, o.offset_peer.to_input_peer()),
            None => (0, 0, tl::enums::InputPeer::Empty),
        };
        let request = tl::functions::messages::GetDialogs {
            exclude_pinned: offset.is_some(),
            folder_id: None,
            offset_date,
            offset_id,
            offset_peer,
            limit: limit as i32,
            hash: 0,
        };

        // `total`: only the `Slice` variant carries an authoritative server-side
        // count (`messages.dialogsSlice.count`); the complete (non-slice)
        // `Dialogs` variant has no count, so the full set IS its own total
        // (`dialogs.len()`) — INV-2.
        let (raw_dialogs, raw_messages, users, chats, is_slice, slice_count) =
            match self.client.client.invoke(&request).await? {
                tl::enums::messages::Dialogs::Dialogs(d) => {
                    let total = d.dialogs.len() as i64;
                    (d.dialogs, d.messages, d.users, d.chats, false, total)
                }
                tl::enums::messages::Dialogs::Slice(d) => {
                    let total = d.count as i64;
                    (d.dialogs, d.messages, d.users, d.chats, true, total)
                }
                tl::enums::messages::Dialogs::NotModified(_) => {
                    anyhow::bail!("GetDialogs returned NotModified (hash=0 must not)")
                }
            };

        let chat_map = ChatMap::new(users, chats);

        // (message id → date) for advancing the offset like grammers does.
        let mut msg_date: HashMap<i32, i32> = HashMap::new();
        for m in &raw_messages {
            if let Some((id, date)) = message_id_and_date(m) {
                msg_date.insert(id, date);
            }
        }

        let mut dialogs = Vec::new();
        for raw in &raw_dialogs {
            let (peer, pinned) = match raw {
                tl::enums::Dialog::Dialog(d) => (&d.peer, d.pinned),
                tl::enums::Dialog::Folder(d) => (&d.peer, false),
            };
            let Some(chat) = chat_map.get(peer) else {
                continue;
            };
            let chat_id = chat.id();
            let packed = chat.pack();
            self.client.peer_cache.lock().await.insert(chat_id, packed);

            let meta = build_dialog_meta(raw, pinned, 0);
            let tg_chat = chat_to_intermediate(chat, &meta);

            // Hydrate the chat's newest messages (DEC-3) — GetDialogs carries only
            // each dialog's single top message, not the snapshot depth. A single
            // chat's getHistory failure (e.g. server `RPC_CALL_FAIL` / 500) must
            // NOT abort the whole bootstrap: fetch into a Result, then let
            // `resolve_hydrated_messages` skip transient failures (chat still
            // discovered) and propagate only fatal (auth / flood-wait) ones.
            let fetched: anyhow::Result<Vec<TgMessage>> = async {
                let mut messages = Vec::new();
                let mut msg_iter = self
                    .client
                    .client
                    .iter_messages(packed)
                    .limit(BOOTSTRAP_MESSAGES_PER_CHAT);
                while let Some(msg) = msg_iter.next().await? {
                    messages.push(message_to_intermediate(&msg, self.account_id, chat_id));
                }
                Ok(messages)
            }
            .await;
            let messages = resolve_hydrated_messages(chat_id, fetched)?;
            dialogs.push(PagedDialog {
                chat: tg_chat,
                messages,
            });
        }

        // Exhausted when Telegram returned the complete (non-slice) set or a short
        // final page; otherwise advance the offset triple from the last dialogs.
        let next_offset = if !is_slice || raw_dialogs.len() < limit {
            None
        } else {
            let mut offset_date = 0;
            let mut offset_id = 0;
            for raw in raw_dialogs.iter().rev() {
                if let tl::enums::Dialog::Dialog(d) = raw {
                    if let Some(date) = msg_date.get(&d.top_message) {
                        offset_date = *date;
                        offset_id = d.top_message;
                        break;
                    }
                }
            }
            raw_dialogs
                .last()
                .and_then(|raw| {
                    let peer = match raw {
                        tl::enums::Dialog::Dialog(d) => &d.peer,
                        tl::enums::Dialog::Folder(d) => &d.peer,
                    };
                    chat_map.get(peer)
                })
                .map(|chat| DialogOffset {
                    offset_date,
                    offset_id,
                    offset_peer: OffsetPeer::from_packed(chat.pack()),
                })
        };

        Ok(DialogPage {
            dialogs,
            next_offset,
            total: Some(slice_count),
        })
    }
}

/// `(id, date)` of a TL message (skipping empty messages), for offset advance.
fn message_id_and_date(message: &tl::enums::Message) -> Option<(i32, i32)> {
    match message {
        tl::enums::Message::Message(m) => Some((m.id, m.date)),
        tl::enums::Message::Service(m) => Some((m.id, m.date)),
        tl::enums::Message::Empty(_) => None,
    }
}

// ---------------------------------------------------------------------------
// grammers → canonical intermediate conversion (ported from client_api.rs +
// envelope.rs). Feeds the SAME `envelope::*_payload` builders fixture mode uses.
// ---------------------------------------------------------------------------

/// `(media_type, has_media, file_name)` for a grammers message — verbatim port
/// of the in-backend `extract_media_info`.
pub fn extract_media_info(message: &Message) -> (Option<String>, bool, Option<String>) {
    match message.media() {
        Some(Media::Photo(_)) => (Some("photo".to_string()), true, None),
        Some(Media::Sticker(_)) => (Some("sticker".to_string()), true, None),
        Some(Media::Document(ref doc)) => {
            let mime = doc.mime_type().unwrap_or("");
            let media_type = if mime.starts_with("video/") {
                "video"
            } else if mime == "audio/ogg" || mime.contains("opus") {
                "voice"
            } else if mime.starts_with("audio/") {
                "audio"
            } else {
                "document"
            };
            let file_name = {
                let name = doc.name();
                if name.is_empty() {
                    None
                } else {
                    Some(name.to_string())
                }
            };
            (Some(media_type.to_string()), true, file_name)
        }
        Some(_) => (Some("unsupported".to_string()), false, None),
        None => (None, false, None),
    }
}

pub fn chat_type_str(chat: &Chat) -> &'static str {
    match chat {
        Chat::User(_) => "private",
        Chat::Group(_) => "group",
        Chat::Channel(_) => "supergroup",
    }
}

pub fn chat_member_count(chat: &Chat) -> Option<i32> {
    match chat {
        Chat::User(_) => None,
        Chat::Group(group) => match &group.raw {
            grammers_tl_types::enums::Chat::Chat(c) => Some(c.participants_count),
            _ => None,
        },
        Chat::Channel(channel) => channel.raw.participants_count,
    }
}

pub fn chat_username(chat: &Chat) -> Option<String> {
    match chat {
        Chat::User(user) => user.username().map(|v| v.to_string()),
        Chat::Channel(channel) => channel.username().map(|v| v.to_string()),
        _ => None,
    }
}

pub fn sender_display_name(sender: Option<&Chat>) -> Option<String> {
    sender.map(|sender| {
        let name = sender.name();
        if !name.is_empty() {
            name.to_string()
        } else {
            match sender {
                Chat::User(user) => user
                    .username()
                    .map(|username| format!("@{}", username))
                    .unwrap_or_else(|| format!("User {}", user.id())),
                _ => sender.id().to_string(),
            }
        }
    })
}

/// grammers `Message` → canonical `TgMessage`. Mirrors the in-backend
/// `message_to_envelope` field extraction exactly (the same `account_id` is
/// stamped into `source_ref` downstream by the payload builder).
pub fn message_to_intermediate(message: &Message, account_id: &str, chat_id: i64) -> TgMessage {
    // `chat_id` is the authoritative DIALOG id supplied by the caller. Messages
    // fetched via iter_messages can carry a "min" peer whose
    // `message.chat().id()` differs from the dialog id (observed for some
    // private chats, e.g. BOX diesel) — keying to it orphans the message from
    // its chat entity (messages.list returns nothing). Always key to the dialog.
    let chat = message.chat();
    let message_id = message.id() as i64;

    let text = message.text().to_string();

    let chat_title = {
        let name = chat.name();
        if name.is_empty() {
            None
        } else {
            Some(name.to_string())
        }
    };

    let sender = message.sender();
    let sender_id = sender.as_ref().and_then(|s| match s {
        Chat::User(user) => Some(user.id()),
        _ => None,
    });
    let sender_name = sender_display_name(sender.as_ref());

    let (media_type, has_media, file_name) = extract_media_info(message);

    let sender_info = if let Some(Chat::User(user)) = sender {
        Some(TgSenderInfo {
            first_name: user.first_name().to_string(),
            last_name: user.last_name().map(|s| s.to_string()),
            username: user.username().map(|s| s.to_string()),
            phone: user.phone().map(|s| s.to_string()),
        })
    } else {
        None
    };

    TgMessage {
        message_id,
        chat_id,
        text,
        date: message.date().to_rfc3339(),
        is_outgoing: message.outgoing(),
        chat_title,
        sender_name,
        sender_id,
        reply_to_msg_id: message.reply_to_message_id().map(|id| id as i64),
        media_type,
        has_media,
        file_name,
        is_pinned: message.pinned(),
        sender_info,
        account_id: account_id.to_string(),
        live: false,
    }
}

/// grammers `Chat` (dialog) → canonical `TgChat`. `meta` carries the dialog
/// counters extracted by the caller (mirrors the in-backend `DialogMeta`).
pub fn chat_to_intermediate(chat: &Chat, meta: &DialogMeta) -> TgChat {
    let title = {
        let name = chat.name();
        if name.is_empty() {
            String::new()
        } else {
            name.to_string()
        }
    };
    TgChat {
        chat_id: chat.id(),
        title,
        chat_type: chat_type_str(chat).to_string(),
        is_pinned: meta.is_pinned,
        pin_order: meta.pin_order,
        unread_count: meta.unread_count,
        unread_mark: meta.unread_mark,
        read_inbox_max_id: meta.read_inbox_max_id,
        read_outbox_max_id: meta.read_outbox_max_id,
        unread_mentions_count: meta.unread_mentions_count,
        top_message: meta.top_message,
        pts: meta.pts,
        member_count: chat_member_count(chat),
        username: chat_username(chat),
        avatar_url: None,
    }
}

/// Dialog metadata, ported from the in-backend `DialogMeta`.
pub struct DialogMeta {
    pub is_pinned: bool,
    pub pin_order: usize,
    pub unread_count: i32,
    pub unread_mark: bool,
    pub read_inbox_max_id: i32,
    pub read_outbox_max_id: i32,
    pub unread_mentions_count: i32,
    pub top_message: i32,
    pub pts: Option<i32>,
}

/// Extract dialog metadata from a TL Dialog enum (port of `build_dialog_meta`).
pub fn build_dialog_meta(
    raw: &grammers_client::grammers_tl_types::enums::Dialog,
    is_pinned: bool,
    pin_order: usize,
) -> DialogMeta {
    use grammers_client::grammers_tl_types::enums::Dialog as TlDialog;
    match raw {
        TlDialog::Dialog(d) => DialogMeta {
            is_pinned,
            pin_order,
            unread_count: d.unread_count,
            unread_mark: d.unread_mark,
            read_inbox_max_id: d.read_inbox_max_id,
            read_outbox_max_id: d.read_outbox_max_id,
            unread_mentions_count: d.unread_mentions_count,
            top_message: d.top_message,
            pts: d.pts,
        },
        TlDialog::Folder(_) => DialogMeta {
            is_pinned,
            pin_order,
            unread_count: 0,
            unread_mark: false,
            read_inbox_max_id: 0,
            read_outbox_max_id: 0,
            unread_mentions_count: 0,
            top_message: 0,
            pts: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn account_id_from_meta_returns_value_when_present() {
        let args = json!({ "_meta": { "account_id": "conn-123" } });
        assert_eq!(account_id_from_meta(&args).unwrap(), "conn-123");
    }

    use grammers_client::InvocationError;
    use grammers_mtsender::RpcError;

    fn rpc_err(code: i32, name: &str) -> anyhow::Error {
        anyhow::Error::new(InvocationError::Rpc(RpcError {
            code,
            name: name.to_string(),
            value: None,
            caused_by: None,
        }))
    }

    fn one_msg(chat_id: i64) -> Vec<TgMessage> {
        vec![TgMessage {
            message_id: 1,
            chat_id,
            text: String::new(),
            date: "2026-01-01T00:00:00+00:00".to_string(),
            is_outgoing: false,
            chat_title: None,
            sender_name: None,
            sender_id: None,
            reply_to_msg_id: None,
            media_type: None,
            has_media: false,
            file_name: None,
            is_pinned: false,
            sender_info: None,
            account_id: String::new(),
            live: false,
        }]
    }

    // tst_src_tg_history_class_010 — a single chat's getHistory server error
    // (`RPC_CALL_FAIL`, code 500 — the real-world failure that aborted bootstrap
    // at 1954/2581) is TRANSIENT: it must be classified non-fatal so the chat's
    // history is skipped and the batch continues. Auth (401) and flood-wait (420
    // / FLOOD_WAIT_*) are FATAL and must surface.
    #[test]
    fn tst_src_tg_history_class_010_rpc_call_fail_is_transient() {
        // The exact failure from the live app: server 500 RPC_CALL_FAIL.
        assert!(
            !history_error_is_fatal(&rpc_err(500, "RPC_CALL_FAIL")),
            "RPC_CALL_FAIL (server 500) must be transient → skip the chat, continue"
        );
        // Other transient classes.
        assert!(!history_error_is_fatal(&rpc_err(
            500,
            "INTERNAL_SERVER_ERROR"
        )));
        assert!(!history_error_is_fatal(&anyhow::anyhow!(
            "connection reset"
        )));

        // Auth/session failures must NEVER be silently swallowed.
        assert!(
            history_error_is_fatal(&rpc_err(401, "AUTH_KEY_UNREGISTERED")),
            "auth failure must propagate, not skip"
        );
        assert!(history_error_is_fatal(&rpc_err(401, "SESSION_REVOKED")));
        // Flood-wait needs host-level backoff, not a per-chat swallow.
        assert!(history_error_is_fatal(&rpc_err(420, "FLOOD_WAIT_30")));
    }

    // tst_src_tg_history_skip_011 — `resolve_hydrated_messages` is the per-chat
    // skip/propagate seam. A transient error → Ok(empty) (chat still discovered,
    // batch continues); a fatal error → Err (batch aborts, host surfaces it);
    // success → the fetched messages.
    #[test]
    fn tst_src_tg_history_skip_011_transient_skips_fatal_propagates() {
        // Success path: messages flow through unchanged.
        let ok = resolve_hydrated_messages(42, Ok(one_msg(42))).unwrap();
        assert_eq!(ok.len(), 1, "successful hydration is preserved");

        // Transient (RPC_CALL_FAIL) → skip this chat's history, NOT an error.
        let skipped = resolve_hydrated_messages(42, Err(rpc_err(500, "RPC_CALL_FAIL"))).unwrap();
        assert!(
            skipped.is_empty(),
            "a transient getHistory error skips the chat's history (empty), no abort"
        );

        // Fatal (auth) → propagate so the host surfaces a typed auth error.
        let fatal = resolve_hydrated_messages(42, Err(rpc_err(401, "AUTH_KEY_UNREGISTERED")));
        assert!(
            fatal.is_err(),
            "an auth failure must propagate, not be swallowed"
        );
    }

    fn flood_err(secs: u32) -> anyhow::Error {
        anyhow::Error::new(InvocationError::Rpc(RpcError {
            code: 420,
            name: format!("FLOOD_WAIT_{secs}"),
            value: Some(secs),
            caused_by: None,
        }))
    }

    // tst_src_tg_021 (INV-3) — a send that hits a SHORT FloodWait (≤ 30s) sleeps
    // the indicated seconds then retries ONCE; the retry succeeds, so the message
    // is delivered. The fake sleeper records the seconds (no real wait), proving
    // the connector slept for the FloodWait value and did not block on MTProto.
    #[tokio::test]
    async fn tst_src_tg_021_short_floodwait_retries_and_succeeds() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let attempts = AtomicUsize::new(0);
        let slept = std::cell::Cell::new(0u64);

        let result = send_with_flood_retry(
            || {
                let n = attempts.fetch_add(1, Ordering::SeqCst);
                async move {
                    if n == 0 {
                        Err(flood_err(5))
                    } else {
                        Ok(json!({ "message_id": 99, "schema_id": "telegram.message" }))
                    }
                }
            },
            |secs| {
                slept.set(secs);
                async {}
            },
        )
        .await;

        let ok = result.expect("short floodwait must retry and succeed");
        assert_eq!(ok["message_id"], 99, "retry sent the message");
        assert_eq!(
            attempts.load(Ordering::SeqCst),
            2,
            "send is attempted exactly twice (initial + one retry)"
        );
        assert_eq!(
            slept.get(),
            5,
            "slept for the FloodWait seconds before retry"
        );
    }

    // tst_src_tg_022 (INV-3) — a send that hits a LONG FloodWait (> 30s) does NOT
    // retry and does NOT block the connector; it returns the `RATE_LIMITED:{secs}`
    // sentinel so the reply path emits code -32002 with retry_after.
    #[tokio::test]
    async fn tst_src_tg_022_long_floodwait_returns_rate_limited_sentinel() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let attempts = AtomicUsize::new(0);
        let slept = std::cell::Cell::new(false);

        let result = send_with_flood_retry(
            || {
                attempts.fetch_add(1, Ordering::SeqCst);
                async { Err::<Value, _>(flood_err(120)) }
            },
            |_secs| {
                slept.set(true);
                async {}
            },
        )
        .await;

        let err = result.expect_err("long floodwait must surface a rate-limit error");
        assert_eq!(
            err.to_string(),
            "RATE_LIMITED:120",
            "long FloodWait yields the RATE_LIMITED:{{secs}} sentinel"
        );
        assert_eq!(
            attempts.load(Ordering::SeqCst),
            1,
            "a long FloodWait must NOT retry (connector not blocked)"
        );
        assert!(
            !slept.get(),
            "a long FloodWait must NOT sleep in the connector"
        );
    }

    // tst_src_tg_023 (INV-3) — flood_wait_secs only fires for FLOOD_WAIT errors and
    // reads the seconds from the grammers RpcError value; non-flood errors → None.
    #[test]
    fn tst_src_tg_023_flood_wait_secs_detects_grammers_floodwait() {
        assert_eq!(flood_wait_secs(&flood_err(31)), Some(31));
        assert_eq!(
            flood_wait_secs(&rpc_err(401, "AUTH_KEY_UNREGISTERED")),
            None
        );
        assert_eq!(flood_wait_secs(&rpc_err(500, "RPC_CALL_FAIL")), None);
        assert_eq!(flood_wait_secs(&anyhow::anyhow!("plain error")), None);
    }

    #[test]
    fn account_id_from_meta_errors_when_missing() {
        // No _meta at all, and _meta without account_id, both error.
        assert!(account_id_from_meta(&json!({})).is_err());
        let err = account_id_from_meta(&json!({ "_meta": {} })).unwrap_err();
        assert!(err.contains("account_id"));
    }

    #[test]
    fn account_id_from_meta_errors_on_empty_string() {
        // NO FALLBACKS: an empty account_id must NOT collapse to "".
        let args = json!({ "_meta": { "account_id": "" } });
        assert!(account_id_from_meta(&args).is_err());
    }

    // tst_src_tg_offset_peer_kinds_007 (DEC-9 edge) — the persisted `OffsetPeer`
    // round-trips through JSON and rebuilds the correct `InputPeer` for each chat
    // kind: User/Channel carry an access_hash; a basic Chat has none (nullable),
    // and a `min`/hash-less peer serializes without `access_hash`.
    #[test]
    fn tst_src_tg_offset_peer_kinds_007_input_peer_roundtrip() {
        // user with access_hash
        let user = OffsetPeer {
            ty: "user".to_string(),
            id: 111,
            access_hash: Some(42),
        };
        let user2: OffsetPeer =
            serde_json::from_value(serde_json::to_value(&user).unwrap()).unwrap();
        assert!(matches!(
            user2.to_input_peer(),
            tl::enums::InputPeer::User(u) if u.user_id == 111 && u.access_hash == 42
        ));

        // channel with access_hash
        let channel = OffsetPeer {
            ty: "channel".to_string(),
            id: 222,
            access_hash: Some(7),
        };
        assert!(matches!(
            channel.to_input_peer(),
            tl::enums::InputPeer::Channel(c) if c.channel_id == 222 && c.access_hash == 7
        ));

        // basic chat: NO access_hash. Must serialize without the field and rebuild
        // an InputPeerChat (no hash).
        let basic = OffsetPeer {
            ty: "chat".to_string(),
            id: 333,
            access_hash: None,
        };
        let json = serde_json::to_value(&basic).unwrap();
        assert!(
            json.get("access_hash").is_none(),
            "null access_hash is omitted"
        );
        let basic2: OffsetPeer = serde_json::from_value(json).unwrap();
        assert!(matches!(
            basic2.to_input_peer(),
            tl::enums::InputPeer::Chat(c) if c.chat_id == 333
        ));
    }
}
