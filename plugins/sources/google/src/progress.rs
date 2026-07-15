//! Pure, HTTP-free sync-progress cursor helper (DEC-7/#5).
//!
//! The google surface fetch fns (`fetch_message_page` / `fetch_events_page` /
//! `fetch_contacts_page`) do live `reqwest` HTTP with no injection point, so the
//! cumulative-`discovered` + `total` carry-forward logic is extracted HERE into a
//! pure function that IS unit-testable. The fetch fns call it; the tests exercise
//! only this seam.
//!
//! ## Contract (INV-2 / INV-7 / INV-8)
//! - `discovered` is CUMULATIVE: prior `discovered` (read from the incoming
//!   cursor) + this page's item count. It never resets mid-bootstrap and is
//!   carried forward in the next cursor.
//! - `total` is a best-effort estimate, resolved as `total.or(prior cursor total)`
//!   so it threads FORWARD: page 1 supplies it (e.g. Gmail `messagesTotal`),
//!   pages 2+ re-report the SAME value read back from the cursor — no
//!   determinate↔indeterminate flicker on the live WS path (INV-7).
//! - On a catchup-style call (`total = None`, prior `discovered = N`) it carries
//!   `N` forward — it never emits `discovered: 0` (INV-8).

use serde_json::{json, Value};

/// Cursor keys produced by [`progress_cursor`], ready to merge into the fetch
/// fn's `nextCursor` object so the next page resumes the counters.
pub struct ProgressCursor {
    /// Cumulative count of primary items enumerated so far (prior + this page).
    pub discovered: u64,
    /// Best-effort total estimate, threaded forward (None → indeterminate).
    pub total: Option<u64>,
}

impl ProgressCursor {
    /// Merge the progress counters (`discovered`, and `total` when known) into an
    /// existing cursor object so they survive into the next page's cursor.
    pub fn merge_into(&self, cursor: &mut Value) {
        if let Some(obj) = cursor.as_object_mut() {
            obj.insert("discovered".to_string(), json!(self.discovered));
            if let Some(total) = self.total {
                obj.insert("total".to_string(), json!(total));
            }
        }
    }
}

/// Read the prior cumulative `discovered` from the incoming cursor.
fn prior_discovered(prior_cursor: Option<&Value>) -> u64 {
    prior_cursor
        .and_then(|c| c.get("discovered"))
        .and_then(Value::as_u64)
        .unwrap_or(0)
}

/// Read a `total` threaded forward in the incoming cursor (Gmail anti-flicker).
fn prior_total(prior_cursor: Option<&Value>) -> Option<u64> {
    prior_cursor
        .and_then(|c| c.get("total"))
        .and_then(Value::as_u64)
}

/// Advance the cumulative progress counters for one fetched page.
///
/// - `prior_cursor` — the cursor the host handed us (None on the first page).
/// - `page_len` — the number of primary items enumerated on THIS page.
/// - `total` — a freshly-observed total estimate (e.g. page-1 `messagesTotal`),
///   or `None` to fall back to the value threaded forward in the cursor.
///
/// Returns the new cumulative `discovered` and the resolved `total` to report in
/// the result AND to thread into the next cursor (INV-2/7/8).
pub fn progress_cursor(
    prior_cursor: Option<&Value>,
    page_len: usize,
    total: Option<u64>,
) -> ProgressCursor {
    let discovered = prior_discovered(prior_cursor) + page_len as u64;
    // Resolve total: a freshly-observed value wins; otherwise re-use the value
    // threaded forward in the cursor so every page re-reports the same total.
    let total = total.or_else(|| prior_total(prior_cursor));
    ProgressCursor { discovered, total }
}

#[cfg(test)]
mod tests {
    use super::*;

    // tst_src_gprogress_cursor_001 (INV-2/7/8) — the pure cursor helper is the
    // only deterministically testable seam (the fetch fns do live HTTP).
    #[test]
    fn tst_src_gprogress_cursor_001_cumulative_total_and_catchup() {
        // No prior cursor + page_len 50 → discovered = 50 (INV-2).
        let p = progress_cursor(None, 50, None);
        assert_eq!(p.discovered, 50, "first page: discovered = page_len");
        assert_eq!(p.total, None, "no total reported, none in cursor → None");

        // Prior discovered=50 + page_len 50 → 100 (cumulative, INV-2).
        let prior = json!({ "discovered": 50 });
        let p = progress_cursor(Some(&prior), 50, None);
        assert_eq!(p.discovered, 100, "cumulative across pages");

        // A freshly-observed total is carried into the cursor bits.
        let p = progress_cursor(None, 50, Some(523));
        assert_eq!(p.total, Some(523), "page-1 total carried through");
        let mut cursor = json!({ "page_token": "tok" });
        p.merge_into(&mut cursor);
        assert_eq!(cursor["discovered"], 50);
        assert_eq!(cursor["total"], 523, "total threaded into the cursor");

        // INV-7: Gmail page-2 reads total FORWARD from the prior cursor when no
        // fresh total is observed (get_profile only runs on page 1).
        let prior = json!({ "discovered": 50, "total": 523 });
        let p = progress_cursor(Some(&prior), 50, None);
        assert_eq!(
            p.total,
            Some(523),
            "page-2 re-reports the same total from the cursor (anti-flicker)"
        );
        assert_eq!(p.discovered, 100);

        // INV-8: a catchup-style call (total=None) with prior discovered=N does
        // NOT emit 0 — it carries the count forward.
        let prior = json!({ "discovered": 200, "history_id": "h1" });
        let p = progress_cursor(Some(&prior), 0, None);
        assert_eq!(
            p.discovered, 200,
            "catchup with an empty page keeps the bootstrap count, never resets to 0"
        );
    }

    // tst_src_gprogress_cursor_001 — `merge_into` carries the counters into a
    // bare object; a None total omits the key (indeterminate source).
    #[test]
    fn tst_src_gprogress_cursor_001_merge_omits_absent_total() {
        let p = progress_cursor(Some(&json!({ "discovered": 100 })), 23, Some(523));
        let mut obj = json!({});
        p.merge_into(&mut obj);
        assert_eq!(obj["discovered"], 123);
        assert_eq!(obj["total"], 523);

        // No total anywhere → the cursor omits the key (indeterminate source).
        let p = progress_cursor(Some(&json!({ "discovered": 10 })), 5, None);
        let mut obj = json!({});
        p.merge_into(&mut obj);
        assert_eq!(obj["discovered"], 15);
        assert!(
            obj.get("total").is_none(),
            "no total → key omitted (indeterminate)"
        );
    }

    // tst_src_gprogress_indeterminate_003 (INV-2, DEC-5) — the Calendar/Contacts
    // pattern: an indeterminate source (total always None) threads cumulative
    // `discovered` across pages via the cursor and NEVER reports a `total`, so the
    // UI renders the "N synced…" indeterminate state. Simulates the surface's
    // page→cursor→page loop with no total at any point.
    #[test]
    fn tst_src_gprogress_indeterminate_003_calendar_contacts_no_total() {
        // Page 1: 250 events, no prior cursor.
        let p1 = progress_cursor(None, 250, None);
        assert_eq!(p1.discovered, 250);
        assert_eq!(p1.total, None, "indeterminate source never has a total");
        let mut cursor = json!({ "page_token": "p2" });
        p1.merge_into(&mut cursor);
        assert!(cursor.get("total").is_none(), "cursor carries no total");

        // Page 2 resumes from the cursor: +180 → 430 cumulative.
        let p2 = progress_cursor(Some(&cursor), 180, None);
        assert_eq!(p2.discovered, 430, "cumulative across pages (INV-2)");
        assert_eq!(p2.total, None);

        // Page 3 (final, fewer items): +20 → 450, still indeterminate.
        let mut cursor = json!({ "page_token": "p3" });
        p2.merge_into(&mut cursor);
        let p3 = progress_cursor(Some(&cursor), 20, None);
        assert_eq!(p3.discovered, 450);
        assert_eq!(p3.total, None, "no total ever appears");
    }
}
