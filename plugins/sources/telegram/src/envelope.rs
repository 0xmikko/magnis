//! Canonical envelope shaping — ported byte-identically from the in-backend
//! `backend/src/sources/telegram/envelope.rs`.
//!
//! Both live mode (grammers `Message`/`Chat`) and fixture mode feed a small
//! serializable intermediate (`TgMessage` / `TgChat` / `TgSenderInfo`) into the
//! SAME payload builders here, so the JSON the host ingests is identical
//! regardless of source. The in-core `telegram` module
//! consumes these payloads unchanged, so the field names, optionality, and
//! `remote_id` / `cursor` shapes MUST match the original exactly.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Sender details for module-side person-entity creation. Mirrors the
/// `sender_info` sub-object built in the in-backend `message_to_envelope`.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct TgSenderInfo {
    pub first_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
}

/// One message in canonical (intermediate) form. Live mode fills this from a
/// grammers `Message`; fixture mode deserializes it from JSON. The builder
/// [`message_payload`] turns it into the exact wire payload.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TgMessage {
    pub message_id: i64,
    pub chat_id: i64,
    #[serde(default)]
    pub text: String,
    /// RFC3339 timestamp string.
    pub date: String,
    #[serde(default)]
    pub is_outgoing: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chat_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sender_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sender_id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply_to_msg_id: Option<i64>,
    /// `photo` | `video` | `voice` | `audio` | `document` | `sticker` |
    /// `unsupported`, etc. `None` when the message has no media.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
    /// True only for actually downloadable media (drives `source_ref`/`file_name`
    /// emission). Non-downloadable types (`unsupported`) carry `media_type` but
    /// no `source_ref`. Defaults to true when a `media_type` is present so a
    /// fixture only needs to set `media_type`.
    #[serde(default = "default_true")]
    pub has_media: bool,
    /// Original filename, if the document carried one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sender_info: Option<TgSenderInfo>,
    /// Account id stamped into `source_ref` for downloadable media. Live mode
    /// passes the real account id; fixtures may omit it (defaults empty).
    #[serde(default)]
    pub account_id: String,
    /// Marks a fixture message as a live arrival, replayed by `magnis.sync.listen`
    /// as a push notification. Ignored by `magnis.sync.fetch` shaping.
    #[serde(default)]
    pub live: bool,
}

fn default_true() -> bool {
    true
}

/// One chat/dialog in canonical (intermediate) form.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TgChat {
    pub chat_id: i64,
    pub title: String,
    /// `private` | `group` | `supergroup`.
    #[serde(rename = "type")]
    pub chat_type: String,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub pin_order: usize,
    #[serde(default)]
    pub unread_count: i32,
    #[serde(default)]
    pub unread_mark: bool,
    #[serde(default)]
    pub read_inbox_max_id: i32,
    #[serde(default)]
    pub read_outbox_max_id: i32,
    #[serde(default)]
    pub unread_mentions_count: i32,
    #[serde(default)]
    pub top_message: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pts: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub member_count: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

/// `remote_id` for a message envelope. Byte-identical to the in-backend
/// `format!("tg:msg:{}:{}", chat_id, message_id)`.
pub fn message_remote_id(chat_id: i64, message_id: i64) -> String {
    format!("tg:msg:{}:{}", chat_id, message_id)
}

/// `remote_id` for a chat envelope. Byte-identical to the in-backend
/// `format!("tg:chat:{}", chat_id)`.
pub fn chat_remote_id(chat_id: i64) -> String {
    format!("tg:chat:{}", chat_id)
}

/// Build the canonical message payload. Field set + ordering + conditional
/// emission mirror the in-backend `message_to_envelope` exactly.
pub fn message_payload(m: &TgMessage) -> Value {
    let mut payload = json!({
        "message_id": m.message_id,
        "chat_id": m.chat_id,
        "text": m.text,
        "date": m.date,
        "is_outgoing": m.is_outgoing,
    });

    if let Some(ref title) = m.chat_title {
        payload["chat_title"] = json!(title);
    }
    if let Some(ref name) = m.sender_name {
        payload["sender_name"] = json!(name);
    }
    if let Some(user_id) = m.sender_id {
        payload["sender_id"] = json!(user_id);
    }
    if let Some(reply_id) = m.reply_to_msg_id {
        payload["reply_to_msg_id"] = json!(reply_id);
    }
    if let Some(ref mt) = m.media_type {
        payload["media_type"] = json!(mt);
        // Only attach source_ref for actually downloadable media. Non-downloadable
        // types (WebPage, Contact, Geo, Poll, etc.) get media_type for display
        // purposes but no file download attempt.
        if m.has_media {
            let subdir = tg_media_subdir(mt);
            let ext = tg_media_ext(mt);
            let dest_subpath = format!(
                "telegram/{}/tg_{}_{}.{}",
                subdir, m.chat_id, m.message_id, ext
            );
            payload["source_ref"] = json!({
                "account_id": m.account_id,
                "chat_id": m.chat_id,
                "message_id": m.message_id,
                "media_type": mt,
                "dest_subpath": dest_subpath,
            });

            // Attach original filename or generate a descriptive name.
            if let Some(ref name) = m.file_name {
                payload["file_name"] = json!(name);
            } else {
                let generated = format!("{}_{}_{}.{}", mt, m.chat_id, m.message_id, ext);
                payload["file_name"] = json!(generated);
            }
        }
    }
    if m.is_pinned {
        payload["is_pinned"] = json!(true);
    }

    if let Some(ref si) = m.sender_info {
        let mut sender_info = json!({
            "first_name": si.first_name,
        });
        if let Some(ref last) = si.last_name {
            sender_info["last_name"] = json!(last);
        }
        if let Some(ref username) = si.username {
            sender_info["username"] = json!(username);
        }
        if let Some(ref phone) = si.phone {
            sender_info["phone"] = json!(phone);
        }
        payload["sender_info"] = sender_info;
    }

    payload
}

/// The per-message cursor: `{ chat_id, message_id }`. Byte-identical to the
/// in-backend `envelope.cursor`.
pub fn message_cursor(m: &TgMessage) -> Value {
    json!({
        "chat_id": m.chat_id,
        "message_id": m.message_id,
    })
}

/// One message → a wire envelope `{ surface, payload, remote_id, kind, cursor }`.
pub fn message_envelope(m: &TgMessage, kind: &str) -> Value {
    json!({
        "surface": "telegram",
        "payload": message_payload(m),
        "remote_id": message_remote_id(m.chat_id, m.message_id),
        "kind": kind,
        "cursor": message_cursor(m),
    })
}

/// Build the canonical chat payload. Field set + conditional emission mirror the
/// in-backend `chat_to_envelope` exactly.
pub fn chat_payload(c: &TgChat) -> Value {
    // Title fallback mirrors the in-backend `format!("Chat {}", chat_id)` when
    // empty — but the intermediate already carries a resolved title, so only the
    // empty case applies the fallback.
    let title = if c.title.is_empty() {
        format!("Chat {}", c.chat_id)
    } else {
        c.title.clone()
    };

    let mut payload = json!({
        "entity_type": "telegram_chat",
        "chat_id": c.chat_id,
        "title": title,
        "type": c.chat_type,
        "is_pinned": c.is_pinned,
        "pin_order": c.pin_order,
        "unread_count": c.unread_count,
        "unread_mark": c.unread_mark,
        "read_inbox_max_id": c.read_inbox_max_id,
        "read_outbox_max_id": c.read_outbox_max_id,
        "unread_mentions_count": c.unread_mentions_count,
        "top_message": c.top_message,
    });
    if let Some(pts) = c.pts {
        payload["pts"] = json!(pts);
    }
    if let Some(mc) = c.member_count {
        payload["member_count"] = json!(mc);
    }
    if let Some(ref username) = c.username {
        payload["username"] = json!(username);
    }
    if let Some(ref url) = c.avatar_url {
        payload["avatar_url"] = json!(url);
    }

    payload
}

/// One chat → a wire envelope. Chats are always `snapshot` (matching the
/// in-backend `chat_to_envelope`, which hard-codes `SourceEventKind::Snapshot`).
pub fn chat_envelope(c: &TgChat) -> Value {
    json!({
        "surface": "telegram",
        "payload": chat_payload(c),
        "remote_id": chat_remote_id(c.chat_id),
        "kind": "snapshot",
    })
}

// ---------------------------------------------------------------------------
// Telegram-specific file path helpers (ported verbatim from the in-backend
// envelope.rs).
// ---------------------------------------------------------------------------

/// Subdirectory under `files/telegram/` for a given Telegram media type.
pub(crate) fn tg_media_subdir(media_type: &str) -> &'static str {
    match media_type {
        "photo" => "photos",
        "voice" => "voice",
        "video" | "video_note" | "animation" => "videos",
        "sticker" => "stickers",
        _ => "documents",
    }
}

/// File extension for a given Telegram media type.
pub(crate) fn tg_media_ext(media_type: &str) -> &'static str {
    match media_type {
        "photo" => "jpg",
        "voice" => "ogg",
        "video" | "video_note" | "animation" => "mp4",
        "sticker" => "webp",
        "audio" => "mp3",
        _ => "bin",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // scn_conn_telegram_env_001 — a plain text message produces the canonical
    // payload + remote_id + cursor, with no media/sender_info keys.
    #[test]
    fn tst_conn_telegram_env_001_plain_message_payload() {
        let m = TgMessage {
            message_id: 42,
            chat_id: 111,
            text: "Hello world".into(),
            date: "2026-05-20T10:00:00+00:00".into(),
            is_outgoing: false,
            chat_title: Some("Project X".into()),
            sender_name: Some("Alice".into()),
            sender_id: Some(222),
            reply_to_msg_id: None,
            media_type: None,
            has_media: true,
            file_name: None,
            is_pinned: false,
            sender_info: None,
            account_id: String::new(),
            live: false,
        };
        let env = message_envelope(&m, "snapshot");
        assert_eq!(env["remote_id"], "tg:msg:111:42");
        assert_eq!(env["surface"], "telegram");
        assert_eq!(env["cursor"], json!({ "chat_id": 111, "message_id": 42 }));
        let p = &env["payload"];
        assert_eq!(p["message_id"], 42);
        assert_eq!(p["chat_id"], 111);
        assert_eq!(p["text"], "Hello world");
        assert_eq!(p["date"], "2026-05-20T10:00:00+00:00");
        assert_eq!(p["is_outgoing"], false);
        assert_eq!(p["chat_title"], "Project X");
        assert_eq!(p["sender_name"], "Alice");
        assert_eq!(p["sender_id"], 222);
        assert!(p.get("media_type").is_none());
        assert!(p.get("source_ref").is_none());
        assert!(p.get("reply_to_msg_id").is_none());
        assert!(p.get("is_pinned").is_none());
        assert!(p.get("sender_info").is_none());
    }

    // scn_conn_telegram_env_002 — a downloadable-media message emits media_type,
    // a source_ref with the telegram dest_subpath, and a derived file_name.
    #[test]
    fn tst_conn_telegram_env_002_media_message_source_ref() {
        let m = TgMessage {
            message_id: 7,
            chat_id: -100,
            text: String::new(),
            date: "2026-05-20T11:00:00+00:00".into(),
            is_outgoing: false,
            chat_title: None,
            sender_name: None,
            sender_id: None,
            reply_to_msg_id: Some(6),
            media_type: Some("photo".into()),
            has_media: true,
            file_name: None,
            is_pinned: true,
            sender_info: Some(TgSenderInfo {
                first_name: "Bob".into(),
                last_name: Some("Jones".into()),
                username: Some("bobj".into()),
                phone: None,
            }),
            account_id: "acct-1".into(),
            live: false,
        };
        let p = message_payload(&m);
        assert_eq!(p["media_type"], "photo");
        assert_eq!(p["reply_to_msg_id"], 6);
        assert_eq!(p["is_pinned"], true);
        let sr = &p["source_ref"];
        assert_eq!(sr["account_id"], "acct-1");
        assert_eq!(sr["chat_id"], -100);
        assert_eq!(sr["message_id"], 7);
        assert_eq!(sr["media_type"], "photo");
        assert_eq!(sr["dest_subpath"], "telegram/photos/tg_-100_7.jpg");
        assert_eq!(p["file_name"], "photo_-100_7.jpg");
        assert_eq!(p["sender_info"]["first_name"], "Bob");
        assert_eq!(p["sender_info"]["last_name"], "Jones");
        assert_eq!(p["sender_info"]["username"], "bobj");
        assert!(p["sender_info"].get("phone").is_none());
    }

    // tst_src_tg_file_account_006 (INV-7, Bug 2) — a media message's
    // source_ref.account_id MIRRORS the message's account_id. The download worker
    // resolves the Telegram session by this id, so it MUST be the real connection
    // id: an empty account_id (the old hardcoded `backfill_chat` value) produces an
    // empty source_ref.account_id → `provide("")` → "no session for account ''" →
    // attachment never downloads. The fix threads the real `_meta.account_id`
    // through execute → backfill_chat → message_to_intermediate so this field is
    // non-empty for backfilled media.
    #[test]
    fn tst_src_tg_file_account_006_source_ref_account_id_mirrors_message() {
        let media = |account_id: &str| TgMessage {
            message_id: 7,
            chat_id: 100,
            text: String::new(),
            date: "2026-05-20T11:00:00+00:00".into(),
            is_outgoing: false,
            chat_title: None,
            sender_name: None,
            sender_id: None,
            reply_to_msg_id: None,
            media_type: Some("photo".into()),
            has_media: true,
            file_name: None,
            is_pinned: false,
            sender_info: None,
            account_id: account_id.to_string(),
            live: false,
        };

        // Fixed path: a real connection id reaches source_ref.account_id.
        let p = message_payload(&media("conn-xyz"));
        assert_eq!(p["source_ref"]["account_id"], "conn-xyz");

        // Bug symptom (regression guard): an empty account_id yields an empty
        // source_ref.account_id — which is exactly why backfill must thread the
        // real id rather than the old hardcoded "".
        let p_empty = message_payload(&media(""));
        assert_eq!(p_empty["source_ref"]["account_id"], "");
    }

    // scn_conn_telegram_env_003 — non-downloadable media (has_media=false) keeps
    // media_type but emits NO source_ref / file_name.
    #[test]
    fn tst_conn_telegram_env_003_nondownloadable_media_no_source_ref() {
        let m = TgMessage {
            message_id: 9,
            chat_id: 5,
            text: "look".into(),
            date: "2026-05-20T12:00:00+00:00".into(),
            is_outgoing: true,
            chat_title: None,
            sender_name: None,
            sender_id: None,
            reply_to_msg_id: None,
            media_type: Some("unsupported".into()),
            has_media: false,
            file_name: None,
            is_pinned: false,
            sender_info: None,
            account_id: String::new(),
            live: false,
        };
        let p = message_payload(&m);
        assert_eq!(p["media_type"], "unsupported");
        assert!(p.get("source_ref").is_none());
        assert!(p.get("file_name").is_none());
    }

    // scn_conn_telegram_env_004 — chat payload mirrors chat_to_envelope: entity
    // type, dialog metadata, optional member_count / username, tg:chat: remote_id.
    #[test]
    fn tst_conn_telegram_env_004_chat_payload() {
        let c = TgChat {
            chat_id: 111,
            title: "Project X".into(),
            chat_type: "group".into(),
            is_pinned: true,
            pin_order: 0,
            unread_count: 2,
            unread_mark: false,
            read_inbox_max_id: 40,
            read_outbox_max_id: 39,
            unread_mentions_count: 0,
            top_message: 42,
            pts: None,
            member_count: Some(5),
            username: Some("projectx".into()),
            avatar_url: None,
        };
        let env = chat_envelope(&c);
        assert_eq!(env["remote_id"], "tg:chat:111");
        assert_eq!(env["kind"], "snapshot");
        let p = &env["payload"];
        assert_eq!(p["entity_type"], "telegram_chat");
        assert_eq!(p["chat_id"], 111);
        assert_eq!(p["title"], "Project X");
        assert_eq!(p["type"], "group");
        assert_eq!(p["is_pinned"], true);
        assert_eq!(p["unread_count"], 2);
        assert_eq!(p["top_message"], 42);
        assert_eq!(p["member_count"], 5);
        assert_eq!(p["username"], "projectx");
        assert!(p.get("pts").is_none());
        assert!(p.get("avatar_url").is_none());
    }
}
