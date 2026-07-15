//! Gmail MIME parsing — ported from `backend/src/sources/google/mail/mime.rs`.

use crate::gmail::{GmailBody, GmailPart, GmailPayload};
use base64::Engine;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtractedBodyContent {
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    pub has_html_body: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttachmentInfo {
    pub attachment_id: String,
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
}

pub fn decode_base64url(data: &str) -> Option<Vec<u8>> {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(data)
        .ok()
        .or_else(|| base64::engine::general_purpose::URL_SAFE.decode(data).ok())
}

pub fn extract_body_content(payload: &GmailPayload) -> ExtractedBodyContent {
    let multipart_text = payload
        .parts
        .as_deref()
        .and_then(|parts| find_part_content(parts, "text/plain"));
    let multipart_html = payload
        .parts
        .as_deref()
        .and_then(|parts| find_part_content(parts, "text/html"));

    let single_part_body = payload.body.as_ref().and_then(decode_body);
    let single_mime = payload.mime_type.as_deref();

    let body_text = non_empty_string(multipart_text.or(match single_mime {
        Some("text/plain") => single_part_body.clone(),
        _ => None,
    }));
    let body_html = non_empty_string(multipart_html.or(match single_mime {
        Some("text/html") => single_part_body,
        _ => None,
    }));

    ExtractedBodyContent {
        has_html_body: body_html.is_some(),
        body_text,
        body_html,
    }
}

pub fn collect_attachments(payload: &GmailPayload) -> Vec<AttachmentInfo> {
    let mut attachments = Vec::new();
    if let Some(parts) = &payload.parts {
        collect_attachments_from_parts(parts, &mut attachments);
    }
    attachments
}

fn collect_attachments_from_parts(parts: &[GmailPart], attachments: &mut Vec<AttachmentInfo>) {
    for part in parts {
        if let Some(filename) = &part.filename {
            if !filename.is_empty() {
                if let Some(body) = &part.body {
                    if let Some(attachment_id) = &body.attachment_id {
                        attachments.push(AttachmentInfo {
                            attachment_id: attachment_id.clone(),
                            filename: filename.clone(),
                            mime_type: part.mime_type.clone().unwrap_or_default(),
                            size: body.size.unwrap_or(0),
                        });
                    }
                }
            }
        }

        if let Some(subparts) = &part.parts {
            collect_attachments_from_parts(subparts, attachments);
        }
    }
}

fn find_part_content(parts: &[GmailPart], mime_type: &str) -> Option<String> {
    for part in parts {
        if part.mime_type.as_deref() == Some(mime_type) {
            if let Some(body) = &part.body {
                if let Some(decoded) = decode_body(body) {
                    return Some(decoded);
                }
            }
        }

        if let Some(subparts) = &part.parts {
            if let Some(found) = find_part_content(subparts, mime_type) {
                return Some(found);
            }
        }
    }

    None
}

fn decode_body(body: &GmailBody) -> Option<String> {
    let data = body.data.as_deref()?;
    let bytes = decode_base64url(data)?;
    Some(String::from_utf8_lossy(&bytes).to_string())
}

fn non_empty_string(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode_base64url(value: &str) -> String {
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(value)
    }

    fn part(mime_type: &str, data: &str) -> GmailPart {
        GmailPart {
            mime_type: Some(mime_type.to_string()),
            filename: None,
            headers: None,
            body: Some(GmailBody {
                attachment_id: None,
                size: Some(data.len() as u64),
                data: Some(encode_base64url(data)),
            }),
            parts: None,
        }
    }

    #[test]
    fn tst_src_mime_001_extract_body_content_keeps_plaintext_and_html_parts_separate() {
        let payload = GmailPayload {
            mime_type: Some("multipart/alternative".to_string()),
            headers: None,
            body: None,
            parts: Some(vec![
                part("text/plain", "Plain body"),
                part("text/html", "<p>HTML body</p>"),
            ]),
        };

        let body = extract_body_content(&payload);

        assert_eq!(body.body_text.as_deref(), Some("Plain body"));
        assert_eq!(body.body_html.as_deref(), Some("<p>HTML body</p>"));
        assert!(body.has_html_body);
    }

    #[test]
    fn tst_src_mime_002_extract_body_content_marks_html_only_messages_without_inventing_plaintext()
    {
        let payload = GmailPayload {
            mime_type: Some("text/html".to_string()),
            headers: None,
            body: Some(GmailBody {
                attachment_id: None,
                size: Some(17),
                data: Some(encode_base64url("<div>Hello</div>")),
            }),
            parts: None,
        };

        let body = extract_body_content(&payload);

        assert_eq!(body.body_text, None);
        assert_eq!(body.body_html.as_deref(), Some("<div>Hello</div>"));
        assert!(body.has_html_body);
    }
}
