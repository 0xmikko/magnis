//! Meetings surface: Google Calendar REST client + canonical conversion + the
//! Sync-Profile fetch logic, ported from
//! `backend/src/sources/google/calendar/{client,runtime}.rs`.
//!
//! Each meetings envelope's `payload` is a full [`CalendarEvent`] serialization
//! (NOT flattened) and `remote_id` is `gcal:{event_id}` — byte-identical to the
//! in-backend calendar runtime so the `meetings` module ingests it unchanged.

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::{check_rate_limit, GoogleSyncError};
use crate::surfaces::{CalendarAttendee, CalendarEvent};

// ── Google Calendar API response types (ported) ──────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GcalEventsResponse {
    pub items: Option<Vec<GcalEvent>>,
    pub next_page_token: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GcalEvent {
    pub id: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
    pub status: Option<String>,
    pub start: Option<GcalDateTime>,
    pub end: Option<GcalDateTime>,
    pub attendees: Option<Vec<GcalAttendee>>,
    pub hangout_link: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GcalDateTime {
    pub date_time: Option<String>,
    pub date: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GcalAttendee {
    pub email: Option<String>,
    pub display_name: Option<String>,
}

// ── REST client ──────────────────────────────────────────────

#[derive(Clone)]
pub struct GoogleCalendarApiClient {
    client: reqwest::Client,
    access_token: String,
}

impl GoogleCalendarApiClient {
    pub fn new(client: reqwest::Client, access_token: String) -> Self {
        Self {
            client,
            access_token,
        }
    }

    pub async fn list_events_page(
        &self,
        time_min: &str,
        time_max: &str,
        page_token: Option<&str>,
    ) -> Result<GcalEventsResponse, GoogleSyncError> {
        let mut url =
            reqwest::Url::parse("https://www.googleapis.com/calendar/v3/calendars/primary/events")
                .map_err(|e| GoogleSyncError::Other(e.into()))?;

        url.query_pairs_mut()
            .append_pair("timeMin", time_min)
            .append_pair("timeMax", time_max)
            .append_pair("singleEvents", "true")
            .append_pair("orderBy", "startTime")
            .append_pair("maxResults", "250");
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
            let text = response.text().await.unwrap_or_default();
            return Err(GoogleSyncError::Other(anyhow::anyhow!(
                "Calendar list events failed: {text}"
            )));
        }

        response
            .json()
            .await
            .map_err(|e| GoogleSyncError::Other(e.into()))
    }

    /// Bootstrap/catch-up events fetch — mirrors the in-backend
    /// `fetch_events_page`. Returns `(envelopes, next_cursor, discovered)` where
    /// each envelope is `{ surface, payload, remote_id }` with payload a full
    /// `CalendarEvent`. The default window is 30 days ago → 90 days ahead,
    /// overridable via `payload.time_min` / `payload.time_max`.
    ///
    /// Calendar has no cheap total estimate, so it reports only a cumulative
    /// `discovered` (DEC-5 → the UI indeterminate "N synced…" state). The count
    /// is read+carried in the cursor via [`crate::progress::progress_cursor`].
    pub async fn fetch_events_page(
        &self,
        cursor: Option<&Value>,
        action_payload: &Value,
    ) -> Result<(Vec<Value>, Option<Value>, u64), GoogleSyncError> {
        let time_min = action_payload
            .get("time_min")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| (Utc::now() - chrono::Duration::days(30)).to_rfc3339());
        let time_max = action_payload
            .get("time_max")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| (Utc::now() + chrono::Duration::days(90)).to_rfc3339());

        let page_token = cursor
            .and_then(|c| c.get("page_token"))
            .and_then(|v| v.as_str());

        let page = self
            .list_events_page(&time_min, &time_max, page_token)
            .await?;

        let mut envelopes = Vec::new();
        let items = page.items.unwrap_or_default();

        for ev in &items {
            if ev.status.as_deref() == Some("cancelled") {
                continue;
            }

            let cal_event = match gcal_event_to_calendar_event(ev) {
                Ok(ce) => ce,
                Err(e) => {
                    eprintln!(
                        "magnis-google: failed to convert calendar event {}: {e}",
                        ev.id
                    );
                    continue;
                }
            };

            let payload =
                serde_json::to_value(&cal_event).map_err(|e| GoogleSyncError::Other(e.into()))?;

            envelopes.push(json!({
                "surface": "meetings",
                "payload": payload,
                "remote_id": format!("gcal:{}", ev.id),
                "kind": "snapshot",
            }));
        }

        // Calendar reports cumulative `discovered` only (no total → indeterminate
        // UI, DEC-5). Count the events surfaced this page and carry the running
        // total in the cursor so the NEXT page resumes it (INV-2). `hasMore` is
        // still derived from cursor presence in main.rs, so the cursor stays
        // `None` on the last page (CON-1: pagination unchanged) — the final
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

// ── GcalEvent → CalendarEvent conversion (ported) ────────────

pub fn gcal_event_to_calendar_event(ev: &GcalEvent) -> Result<CalendarEvent> {
    let title = ev
        .summary
        .clone()
        .unwrap_or_else(|| "Untitled Event".to_string());

    let (starts_at, all_day) = resolve_datetime(&ev.start)?;
    let (ends_at, _) = resolve_datetime(&ev.end)?;

    let status = ev.status.clone().unwrap_or_else(|| "confirmed".to_string());

    let attendees: Vec<CalendarAttendee> = ev
        .attendees
        .as_ref()
        .map(|list| {
            list.iter()
                .filter_map(|a| {
                    let email = a.email.clone()?;
                    Some(CalendarAttendee {
                        name: a.display_name.clone(),
                        email,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(CalendarEvent {
        id: ev.id.clone(),
        title,
        description: ev.description.clone(),
        location: ev.location.clone(),
        starts_at,
        ends_at,
        all_day,
        status,
        attendees,
        conference_link: ev.hangout_link.clone(),
    })
}

fn resolve_datetime(dt: &Option<GcalDateTime>) -> Result<(DateTime<Utc>, bool)> {
    match dt {
        Some(GcalDateTime {
            date_time: Some(dt_str),
            ..
        }) => {
            let parsed = DateTime::parse_from_rfc3339(dt_str)
                .map_err(|e| anyhow::anyhow!("bad datetime '{dt_str}': {e}"))?;
            Ok((parsed.with_timezone(&Utc), false))
        }
        Some(GcalDateTime {
            date: Some(d),
            date_time: None,
        }) => {
            // All-day event: "2026-03-01" → midnight UTC
            let iso = format!("{d}T00:00:00Z");
            let parsed = DateTime::parse_from_rfc3339(&iso)
                .map_err(|e| anyhow::anyhow!("bad date '{d}': {e}"))?;
            Ok((parsed.with_timezone(&Utc), true))
        }
        _ => Ok((Utc::now(), false)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tst_src_gcal_001_gcal_event_conversion_basic() {
        let ev = GcalEvent {
            id: "evt_1".into(),
            summary: Some("Team standup".into()),
            description: Some("Daily sync".into()),
            location: Some("Room A".into()),
            status: Some("confirmed".into()),
            start: Some(GcalDateTime {
                date_time: Some("2026-03-13T09:00:00Z".into()),
                date: None,
            }),
            end: Some(GcalDateTime {
                date_time: Some("2026-03-13T09:30:00Z".into()),
                date: None,
            }),
            attendees: Some(vec![GcalAttendee {
                email: Some("alice@example.com".into()),
                display_name: Some("Alice".into()),
            }]),
            hangout_link: Some("https://meet.google.com/abc".into()),
        };

        let cal = gcal_event_to_calendar_event(&ev).unwrap();
        assert_eq!(cal.id, "evt_1");
        assert_eq!(cal.title, "Team standup");
        assert!(!cal.all_day);
        assert_eq!(cal.status, "confirmed");
        assert_eq!(cal.attendees.len(), 1);
        assert_eq!(cal.attendees[0].email, "alice@example.com");
        assert_eq!(
            cal.conference_link.as_deref(),
            Some("https://meet.google.com/abc")
        );
    }

    #[test]
    fn tst_src_gcal_002_gcal_event_all_day() {
        let ev = GcalEvent {
            id: "evt_2".into(),
            summary: Some("Holiday".into()),
            description: None,
            location: None,
            status: None,
            start: Some(GcalDateTime {
                date_time: None,
                date: Some("2026-03-14".into()),
            }),
            end: Some(GcalDateTime {
                date_time: None,
                date: Some("2026-03-15".into()),
            }),
            attendees: None,
            hangout_link: None,
        };

        let cal = gcal_event_to_calendar_event(&ev).unwrap();
        assert!(cal.all_day);
        assert_eq!(cal.title, "Holiday");
        assert_eq!(cal.status, "confirmed");
    }
}
