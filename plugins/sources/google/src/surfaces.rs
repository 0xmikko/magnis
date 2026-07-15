//! Canonical surface structs the connector serializes its payloads from.
//!
//! Copied byte-for-byte (field shape) from the in-backend surface contracts —
//! `backend/src/sources/surfaces/mail.rs` and `surfaces/calendar.rs` — so the
//! `email` / `meetings` modules ingest the connector's envelopes unchanged. The
//! connector is standalone: it does NOT depend on the `magnis` crate, so the
//! types live here.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ── Mail (surface = "email") ─────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EmailAddress {
    pub name: Option<String>,
    pub address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MailAttachment {
    pub attachment_id: String,
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MailMessage {
    /// Provider-scoped unique id (e.g. Gmail message id, IMAP UID).
    pub id: String,
    /// Conversation/thread grouping (provider-specific, optional).
    pub thread_id: Option<String>,
    /// RFC 2822 Message-ID header (for In-Reply-To threading).
    pub message_id_header: Option<String>,

    // Headers
    pub subject: String,
    pub from: EmailAddress,
    pub to: Vec<EmailAddress>,
    pub cc: Vec<EmailAddress>,
    pub bcc: Vec<EmailAddress>,
    pub sent_at: DateTime<Utc>,

    // Content
    pub snippet: String,
    pub body_text: Option<String>,
    pub body_html: Option<String>,

    // Metadata
    pub labels: Vec<String>,
    pub is_read: bool,
    pub is_starred: bool,
    pub has_attachments: bool,
    pub attachments: Vec<MailAttachment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MailDraftAttachment {
    pub filename: String,
    pub mime_type: String,
    #[serde(with = "base64_bytes")]
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MailDraft {
    pub to: Vec<EmailAddress>,
    #[serde(default)]
    pub cc: Vec<EmailAddress>,
    #[serde(default)]
    pub bcc: Vec<EmailAddress>,
    pub subject: String,
    pub body_text: String,
    #[serde(default)]
    pub body_html: Option<String>,
    #[serde(default)]
    pub in_reply_to: Option<String>,
    #[serde(default)]
    pub attachments: Vec<MailDraftAttachment>,
}

/// Serde helper: serialize Vec<u8> as base64 string for JSON transport. Matches
/// the in-backend `MailDraftAttachment` wire form so drafts round-trip.
mod base64_bytes {
    use base64::Engine;
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(bytes: &[u8], serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        serializer.serialize_str(&encoded)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        base64::engine::general_purpose::STANDARD
            .decode(&s)
            .map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SendResult {
    pub message_id: String,
    pub thread_id: Option<String>,
}

// ── Calendar (surface = "meetings") ──────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub all_day: bool,
    pub status: String, // "confirmed", "tentative", "cancelled"
    pub attendees: Vec<CalendarAttendee>,
    pub conference_link: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CalendarAttendee {
    pub name: Option<String>,
    pub email: String,
}

// ── Contacts (surface = "contacts") ──────────────────────────

/// Canonical contact — matches what the backend
/// `modules/contacts/schemas.rs` ingest path expects. A single Person
/// from Google People API maps to one of these. Other providers can
/// implement the same shape to feed the contacts module.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Contact {
    /// Provider-stable id. For Google: the SHA-256 (hex, first 16
    /// chars) of `people/{id}` resource name — stable across fetches
    /// even when the display name changes.
    pub id: String,
    /// Optional display name as the provider reports it. Falls back
    /// to "{given_name} {family_name}" when display_name is null.
    pub display_name: Option<String>,
    pub given_name: Option<String>,
    pub family_name: Option<String>,
    /// All known email addresses. May be empty — phone-only contacts
    /// are still valid (matches People API behaviour).
    pub emails: Vec<ContactEmail>,
    pub phones: Vec<ContactPhone>,
    pub organizations: Vec<ContactOrg>,
    /// HTTPS URL to the contact's photo, if the provider serves one.
    pub photo_url: Option<String>,
    /// Web URL that opens the contact in the provider's UI.
    pub external_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContactEmail {
    pub address: String,
    /// `"home"`, `"work"`, free-form label, or `None`.
    pub label: Option<String>,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContactPhone {
    pub number: String,
    pub label: Option<String>,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContactOrg {
    pub name: Option<String>,
    pub title: Option<String>,
    pub is_current: bool,
}
