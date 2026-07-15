//! Contacts surface: Google People API client + canonical conversion.
//!
//! Mirrors the layout of `calendar.rs`. Each contacts envelope's
//! `payload` is a full [`Contact`] serialization and
//! `remote_id` is `gpeople:{stable_hash}` so the backend
//! contacts module dedups across fetches even if the display name
//! changes.

use anyhow::Result;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::auth::{check_rate_limit, GoogleSyncError};
use crate::surfaces::{Contact, ContactEmail, ContactOrg, ContactPhone};

// ── Google People API response types ────────────────────────

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpeopleConnectionsResponse {
    #[serde(default)]
    pub connections: Vec<GpeoplePerson>,
    pub next_page_token: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpeoplePerson {
    /// Always present — looks like `"people/c12345…"`.
    pub resource_name: String,
    #[serde(default)]
    pub names: Vec<GpeopleName>,
    #[serde(default)]
    pub email_addresses: Vec<GpeopleEmail>,
    #[serde(default)]
    pub phone_numbers: Vec<GpeoplePhone>,
    #[serde(default)]
    pub organizations: Vec<GpeopleOrganization>,
    #[serde(default)]
    pub photos: Vec<GpeoplePhoto>,
    #[serde(default)]
    pub urls: Vec<GpeopleUrl>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpeopleName {
    pub display_name: Option<String>,
    pub given_name: Option<String>,
    pub family_name: Option<String>,
    #[serde(default)]
    pub metadata: GpeopleMetadata,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpeopleEmail {
    pub value: Option<String>,
    #[serde(rename = "type")]
    pub type_: Option<String>,
    #[serde(default)]
    pub metadata: GpeopleMetadata,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpeoplePhone {
    pub value: Option<String>,
    pub canonical_form: Option<String>,
    #[serde(rename = "type")]
    pub type_: Option<String>,
    #[serde(default)]
    pub metadata: GpeopleMetadata,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpeopleOrganization {
    pub name: Option<String>,
    pub title: Option<String>,
    pub current: Option<bool>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpeoplePhoto {
    pub url: Option<String>,
    #[serde(default)]
    pub metadata: GpeopleMetadata,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpeopleUrl {
    pub value: Option<String>,
    #[serde(rename = "type")]
    pub type_: Option<String>,
}

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GpeopleMetadata {
    #[serde(default)]
    pub primary: bool,
}

// ── REST client ──────────────────────────────────────────────

#[derive(Clone)]
pub struct GoogleContactsApiClient {
    client: reqwest::Client,
    access_token: String,
}

impl GoogleContactsApiClient {
    pub fn new(client: reqwest::Client, access_token: String) -> Self {
        Self {
            client,
            access_token,
        }
    }

    pub async fn list_connections_page(
        &self,
        page_token: Option<&str>,
    ) -> Result<GpeopleConnectionsResponse, GoogleSyncError> {
        let mut url = reqwest::Url::parse("https://people.googleapis.com/v1/people/me/connections")
            .map_err(|e| GoogleSyncError::Other(e.into()))?;
        url.query_pairs_mut()
            .append_pair(
                "personFields",
                "names,emailAddresses,phoneNumbers,organizations,photos,urls",
            )
            .append_pair("pageSize", "100");
        if let Some(token) = page_token {
            url.query_pairs_mut().append_pair("pageToken", token);
        }

        let response = crate::send_with_retry(self.client.get(url).bearer_auth(&self.access_token))
            .await
            .map_err(|e| GoogleSyncError::Other(e.into()))?;

        if let Some(rate_limit) = check_rate_limit(&response) {
            return Err(rate_limit);
        }

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(GoogleSyncError::Other(anyhow::anyhow!(
                "People API list_connections failed: HTTP {status} — {text}"
            )));
        }

        response
            .json()
            .await
            .map_err(|e| GoogleSyncError::Other(e.into()))
    }

    /// Bootstrap/catch-up fetch (People API has no delta token —
    /// always full snapshot). Returns `(envelopes, next_cursor, discovered)`.
    ///
    /// Contacts has no cheap total estimate, so it reports only a cumulative
    /// `discovered` (DEC-5 → the UI indeterminate "N synced…" state), read+carried
    /// in the cursor via [`crate::progress::progress_cursor`].
    pub async fn fetch_contacts_page(
        &self,
        cursor: Option<&Value>,
    ) -> Result<(Vec<Value>, Option<Value>, u64), GoogleSyncError> {
        let page_token = cursor
            .and_then(|c| c.get("page_token"))
            .and_then(|v| v.as_str());

        let page = self.list_connections_page(page_token).await?;

        let mut envelopes = Vec::new();
        for person in &page.connections {
            let Some(contact) = gpeople_person_to_contact(person) else {
                continue; // INV-CONTACTS-2: skip rows with no useful identity
            };

            let payload =
                serde_json::to_value(&contact).map_err(|e| GoogleSyncError::Other(e.into()))?;

            envelopes.push(json!({
                "surface": "contacts",
                "payload": payload,
                "remote_id": format!("gpeople:{}", contact.id),
                "kind": "snapshot",
            }));
        }

        // Cumulative `discovered` only (no total → indeterminate UI, DEC-5).
        // `hasMore` is derived from cursor presence in main.rs, so the cursor
        // stays `None` on the last page (CON-1: pagination unchanged); the final
        // `discovered` is reported in the result json regardless.
        let progress = crate::progress::progress_cursor(cursor, envelopes.len(), None);

        let next_cursor = page.next_page_token.map(|t| {
            let mut c = json!({ "page_token": t });
            progress.merge_into(&mut c);
            c
        });
        Ok((envelopes, next_cursor, progress.discovered))
    }
}

// ── GpeoplePerson → Contact conversion ───────────────────────

/// Convert a People API Person into a canonical [`Contact`]. Returns
/// `None` if the person has no useful identity (no name, no email,
/// no phone) — INV-CONTACTS-2.
pub fn gpeople_person_to_contact(p: &GpeoplePerson) -> Option<Contact> {
    let primary_name = pick_primary(&p.names, |n| n.metadata.primary);
    let display_name = primary_name
        .as_ref()
        .and_then(|n| n.display_name.clone())
        .or_else(|| {
            primary_name.as_ref().and_then(|n| {
                match (n.given_name.as_deref(), n.family_name.as_deref()) {
                    (Some(g), Some(f)) => Some(format!("{g} {f}")),
                    (Some(g), None) => Some(g.to_string()),
                    (None, Some(f)) => Some(f.to_string()),
                    (None, None) => None,
                }
            })
        });

    let emails: Vec<ContactEmail> = p
        .email_addresses
        .iter()
        .filter_map(|e| {
            let address = e.value.clone()?;
            Some(ContactEmail {
                address,
                label: e.type_.clone(),
                is_primary: e.metadata.primary,
            })
        })
        .collect();

    let phones: Vec<ContactPhone> = p
        .phone_numbers
        .iter()
        .filter_map(|ph| {
            let number = ph.canonical_form.clone().or_else(|| ph.value.clone())?;
            Some(ContactPhone {
                number,
                label: ph.type_.clone(),
                is_primary: ph.metadata.primary,
            })
        })
        .collect();

    // INV-CONTACTS-2 filter: at least ONE of {name, email, phone}
    // must be present, otherwise the contact is useless to ingest.
    if display_name.is_none() && emails.is_empty() && phones.is_empty() {
        return None;
    }

    let organizations: Vec<ContactOrg> = p
        .organizations
        .iter()
        .map(|o| ContactOrg {
            name: o.name.clone(),
            title: o.title.clone(),
            is_current: o.current.unwrap_or(false),
        })
        .collect();

    let photo_url = pick_primary(&p.photos, |ph| ph.metadata.primary).and_then(|ph| ph.url.clone());

    let external_url = p
        .urls
        .iter()
        .find(|u| {
            u.type_
                .as_deref()
                .map(|t| t.eq_ignore_ascii_case("profile"))
                == Some(true)
        })
        .and_then(|u| u.value.clone());

    Some(Contact {
        id: stable_contact_id(&p.resource_name),
        display_name,
        given_name: primary_name.as_ref().and_then(|n| n.given_name.clone()),
        family_name: primary_name.and_then(|n| n.family_name.clone()),
        emails,
        phones,
        organizations,
        photo_url,
        external_url,
    })
}

fn pick_primary<T: Clone>(items: &[T], is_primary: impl Fn(&T) -> bool) -> Option<T> {
    items
        .iter()
        .find(|x| is_primary(x))
        .or_else(|| items.first())
        .cloned()
}

/// SHA-256 of the `people/{id}` resource_name, hex-encoded, first 16
/// chars. Stable across fetches (resource_name doesn't change) and
/// short enough to use as a graph external-link key.
fn stable_contact_id(resource_name: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(resource_name.as_bytes());
    let digest = hasher.finalize();
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    hex[..16].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta_primary(primary: bool) -> GpeopleMetadata {
        GpeopleMetadata { primary }
    }

    fn fixture_full_person() -> GpeoplePerson {
        GpeoplePerson {
            resource_name: "people/c12345".into(),
            names: vec![GpeopleName {
                display_name: Some("Mikhail Lazarev".into()),
                given_name: Some("Mikhail".into()),
                family_name: Some("Lazarev".into()),
                metadata: meta_primary(true),
            }],
            email_addresses: vec![GpeopleEmail {
                value: Some("mikhail@example.com".into()),
                type_: Some("work".into()),
                metadata: meta_primary(true),
            }],
            phone_numbers: vec![GpeoplePhone {
                value: Some("+49 30 1234567".into()),
                canonical_form: Some("+4930 1234567".into()),
                type_: Some("mobile".into()),
                metadata: meta_primary(true),
            }],
            organizations: vec![GpeopleOrganization {
                name: Some("Acme".into()),
                title: Some("Engineer".into()),
                current: Some(true),
            }],
            photos: vec![],
            urls: vec![],
        }
    }

    #[test]
    fn tst_contacts_001_full_person_converts() {
        let c = gpeople_person_to_contact(&fixture_full_person()).expect("full person");
        assert_eq!(c.display_name.as_deref(), Some("Mikhail Lazarev"));
        assert_eq!(c.given_name.as_deref(), Some("Mikhail"));
        assert_eq!(c.family_name.as_deref(), Some("Lazarev"));
        assert_eq!(c.emails.len(), 1);
        assert_eq!(c.emails[0].address, "mikhail@example.com");
        assert!(c.emails[0].is_primary);
        assert_eq!(c.phones.len(), 1);
        assert_eq!(c.phones[0].number, "+4930 1234567");
        assert_eq!(c.organizations[0].name.as_deref(), Some("Acme"));
        assert!(c.organizations[0].is_current);
        // 16-hex-char stable id
        assert_eq!(c.id.len(), 16);
        assert!(c.id.chars().all(|ch| ch.is_ascii_hexdigit()));
    }

    #[test]
    fn tst_contacts_002_id_is_stable() {
        let a = gpeople_person_to_contact(&fixture_full_person()).unwrap();
        let b = gpeople_person_to_contact(&fixture_full_person()).unwrap();
        assert_eq!(a.id, b.id, "same resource_name → same id");
    }

    #[test]
    fn tst_contacts_003_falls_back_to_given_family_when_display_missing() {
        let mut p = fixture_full_person();
        p.names[0].display_name = None;
        let c = gpeople_person_to_contact(&p).unwrap();
        assert_eq!(c.display_name.as_deref(), Some("Mikhail Lazarev"));
    }

    #[test]
    fn tst_contacts_004_partial_person_kept() {
        // Only email — no name, no phone. INV-CONTACTS-2: keep.
        let p = GpeoplePerson {
            resource_name: "people/c999".into(),
            names: vec![],
            email_addresses: vec![GpeopleEmail {
                value: Some("nobody@example.com".into()),
                type_: None,
                metadata: meta_primary(false),
            }],
            phone_numbers: vec![],
            organizations: vec![],
            photos: vec![],
            urls: vec![],
        };
        let c = gpeople_person_to_contact(&p).expect("email-only contact is kept");
        assert!(c.display_name.is_none());
        assert_eq!(c.emails.len(), 1);
    }

    #[test]
    fn tst_contacts_005_empty_person_skipped() {
        // No name, no email, no phone — INV-CONTACTS-2: skip.
        let p = GpeoplePerson {
            resource_name: "people/c000".into(),
            names: vec![],
            email_addresses: vec![],
            phone_numbers: vec![],
            organizations: vec![GpeopleOrganization {
                name: Some("Org with no identity".into()),
                title: None,
                current: None,
            }],
            photos: vec![],
            urls: vec![],
        };
        assert!(gpeople_person_to_contact(&p).is_none());
    }

    #[test]
    fn tst_contacts_006_canonical_phone_preferred_over_raw() {
        let mut p = fixture_full_person();
        p.phone_numbers[0].canonical_form = Some("+4930111".into());
        p.phone_numbers[0].value = Some("030 111 (raw)".into());
        let c = gpeople_person_to_contact(&p).unwrap();
        assert_eq!(c.phones[0].number, "+4930111");
    }
}
