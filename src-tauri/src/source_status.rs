//! The tray's mirror of `source.status.list`, and the line it renders.
//!
//! This is the THIRD mirror of one wire format — the Rust backend, the shared
//! TypeScript package, and now the shell. The project already named that and
//! solved it: seven golden fixtures in `tests/fixtures/source-status/`, read by
//! both the Rust matrix test and the frontend golden test under the invariant
//! "one wire format, two mirrors". The tray joins them rather than authoring
//! its own cases.
//!
//! That matters more than tidiness. Hand-written cases are written by whoever
//! wrote the mirror, so a *field-level* misreading passes its own test — and
//! that has shipped here before, recorded upstream as the "Email · 1" incident:
//! a settled surface's badge must be the graph item total, never the last
//! run's `ingested` count. The tests below therefore assert **laws over the
//! payload**, not literal strings.
//!
//! Deliberately NOT `deny_unknown_fields`: the producer uses it correctly, but
//! in a consumer it would turn every additive backend field into a hard tray
//! failure. Unknown *variants* get a named state; unknown *fields* are ignored.

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct SourceStatus {
    #[serde(default)]
    pub accounts: Vec<Account>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Account {
    /// The account's own health. Dropping this was a real defect: an account
    /// whose OAuth has expired has no *working* surface and no *broken*
    /// surface either — its surfaces are simply `never_synced` — so the line
    /// read "Connected" for an account that cannot sync at all. The wire
    /// carries the answer one level up, and the TypeScript mirror checks it
    /// first for the same reason.
    pub state: AccountState,
    #[serde(default)]
    pub surfaces: Vec<SurfaceSync>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum AccountState {
    Connected,
    AuthLost,
    #[serde(other)]
    Unknown,
}

impl AccountState {
    fn needs_attention(&self) -> bool {
        !matches!(self, AccountState::Connected)
    }
}

/// The seven surface states. `Unknown` is not a wire variant: it is what a
/// consumer must have so a backend that grows an eighth degrades legibly
/// instead of failing to parse and going dark forever.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum SurfaceSync {
    NeverSynced {
        surface: String,
    },
    Bootstrapping {
        surface: String,
    },
    CatchingUp {
        surface: String,
    },
    Synced {
        surface: String,
        items: ItemCount,
    },
    Live {
        surface: String,
        items: ItemCount,
    },
    RateLimited {
        surface: String,
    },
    Failed {
        surface: String,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ItemCount {
    Exact { value: i64 },
    Unknown,
}

impl SurfaceSync {
    /// The number this surface may show, if any.
    ///
    /// Only settled states carry one, and it is always the graph total. A
    /// surface mid-run has a `fetched`/`ingested` pair that is tempting and
    /// wrong: it describes the run, not the corpus.
    pub fn badge_count(&self) -> Option<i64> {
        match self {
            SurfaceSync::Synced { items, .. } | SurfaceSync::Live { items, .. } => match items {
                ItemCount::Exact { value } => Some(*value),
                ItemCount::Unknown => None,
            },
            _ => None,
        }
    }

    /// The surface's name, when it has one.
    fn surface(&self) -> Option<&str> {
        match self {
            SurfaceSync::NeverSynced { surface }
            | SurfaceSync::Bootstrapping { surface }
            | SurfaceSync::CatchingUp { surface }
            | SurfaceSync::Synced { surface, .. }
            | SurfaceSync::Live { surface, .. }
            | SurfaceSync::RateLimited { surface }
            | SurfaceSync::Failed { surface } => Some(surface),
            SurfaceSync::Unknown => None,
        }
    }

    fn is_working(&self) -> bool {
        matches!(
            self,
            SurfaceSync::Bootstrapping { .. } | SurfaceSync::CatchingUp { .. }
        )
    }

    fn is_broken(&self) -> bool {
        matches!(
            self,
            SurfaceSync::Failed { .. } | SurfaceSync::RateLimited { .. } | SurfaceSync::Unknown
        )
    }
}

/// One line for the status bar.
///
/// Indexing beats counting: a user who is mid-sync wants to know that, not a
/// total that is still moving.
pub fn status_line(sources: &[SourceStatus]) -> String {
    let surfaces: Vec<&SurfaceSync> = sources
        .iter()
        .flat_map(|s| s.accounts.iter())
        .flat_map(|a| a.surfaces.iter())
        .collect();

    if sources.iter().all(|s| s.accounts.is_empty()) {
        return "No accounts connected".to_string();
    }

    // An account that lost its authorisation is checked BEFORE anything about
    // its surfaces: a signed-out account has nothing working and nothing
    // failing, so every surface-level signal reads healthy.
    let broken_accounts = sources
        .iter()
        .flat_map(|s| s.accounts.iter())
        .filter(|a| a.state.needs_attention())
        .count();
    if broken_accounts > 0 {
        return match broken_accounts {
            1 => "1 account needs attention".to_string(),
            n => format!("{n} accounts need attention"),
        };
    }
    if let Some(working) = surfaces.iter().find(|s| s.is_working()) {
        return match working.surface() {
            Some(name) => format!("Indexing {name}…"),
            None => "Indexing…".to_string(),
        };
    }

    let total: i64 = surfaces.iter().filter_map(|s| s.badge_count()).sum();
    let broken = surfaces.iter().filter(|s| s.is_broken()).count();
    match (total, broken) {
        (0, 0) => "Connected".to_string(),
        (n, 0) => format!("Indexed {n} items"),
        (n, b) => format!("Indexed {n} items · {b} need attention"),
    }
}

#[cfg(test)]
mod tests {
    use super::{status_line, SourceStatus, SurfaceSync};

    /// The fixtures live at the repository root, shared with the Rust matrix
    /// test and the frontend golden test. The desktop crate is its own
    /// workspace, so the path climbs out of it explicitly.
    fn fixture_dir() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/source-status")
    }

    fn load_all() -> Vec<(String, Vec<SourceStatus>)> {
        let mut out = Vec::new();
        for entry in std::fs::read_dir(fixture_dir()).expect("fixtures directory") {
            let path = entry.expect("dir entry").path();
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();
            // `fsm_edges.json` shares the directory and is NOT a status payload;
            // the frontend loader skips it by name and so does this.
            if !name.ends_with(".json") || name == "fsm_edges.json" {
                continue;
            }
            let raw = std::fs::read_to_string(&path).expect("read fixture");
            let parsed: Vec<SourceStatus> = serde_json::from_str(&raw)
                .or_else(|_| serde_json::from_str::<SourceStatus>(&raw).map(|s| vec![s]))
                .unwrap_or_else(|e| panic!("{name} does not parse as source.status.list: {e}"));
            out.push((name, parsed));
        }
        assert!(!out.is_empty(), "the shared fixtures must be reachable");
        out
    }

    // @test-id: tst_desktop_trayfmt_001
    // @invariant: INV-DTR-9
    // @covers: source_status::SurfaceSync, source_status::status_line
    // @deterministic: yes
    // @fixtures: tests/fixtures/source-status (shared with two other suites)
    #[test]
    fn tst_desktop_trayfmt_001_every_shared_fixture_parses_and_obeys_the_badge_law() {
        for (name, sources) in load_all() {
            for surface in sources
                .iter()
                .flat_map(|s| s.accounts.iter())
                .flat_map(|a| a.surfaces.iter())
            {
                // The law, not a literal: an unsettled surface shows no number
                // at all. This is the "Email · 1" incident in assertion form —
                // a run's `ingested` must never become the badge.
                if !matches!(
                    surface,
                    SurfaceSync::Synced { .. } | SurfaceSync::Live { .. }
                ) {
                    assert_eq!(
                        surface.badge_count(),
                        None,
                        "{name}: only a settled surface may carry a count"
                    );
                }
            }
            // Rendering never panics and never produces an empty line.
            assert!(!status_line(&sources).is_empty(), "{name}: empty line");
        }
    }

    // @test-id: tst_desktop_trayfmt_003
    // @invariant: INV-DTR-9
    // @covers: source_status::status_line, AccountState
    // @deterministic: yes
    // @fixtures: tests/fixtures/source-status/oauth-authlost-expired.json,
    //            tests/fixtures/source-status/oauth-connected-multi.json
    //
    // The two assertions the shared fixtures exist for, and which the badge law
    // alone does not make: an account that lost its authorisation must not read
    // as healthy, and a settled surface's number is the graph total, never the
    // last run's ingested count.
    #[test]
    fn tst_desktop_trayfmt_003_broken_account_and_the_settled_number() {
        let by_name: std::collections::HashMap<String, Vec<SourceStatus>> =
            load_all().into_iter().collect();

        let expired = by_name
            .get("oauth-authlost-expired.json")
            .expect("the auth-lost fixture");
        let line = status_line(expired);
        assert!(
            line.contains("need") && line.contains("attention"),
            "an expired account must not read as healthy, got {line:?}"
        );

        // The "Email · 1" incident, as an assertion. This fixture pairs a
        // settled email surface carrying items 17095 with a run that ingested
        // 100; a mirror reading the run would render 100.
        let multi = by_name
            .get("oauth-connected-multi.json")
            .expect("the multi-account fixture");
        let counts: Vec<i64> = multi
            .iter()
            .flat_map(|s| s.accounts.iter())
            .flat_map(|a| a.surfaces.iter())
            .filter_map(|s| s.badge_count())
            .collect();
        assert!(
            counts.contains(&17095),
            "the settled surface must report the graph total, got {counts:?}"
        );
        assert!(
            !counts.contains(&100),
            "100 is the run's ingested count and must never become a badge: {counts:?}"
        );

        // Guard against the whole suite going vacuous if the wire shape moves:
        // every field is `#[serde(default)]`, so a changed payload would parse
        // into zero surfaces and every loop above would run zero times.
        let surfaces: usize = by_name
            .values()
            .flat_map(|v| v.iter())
            .flat_map(|s| s.accounts.iter())
            .map(|a| a.surfaces.len())
            .sum();
        assert!(surfaces >= 5, "expected real surfaces, examined {surfaces}");
    }

    // @test-id: tst_desktop_trayfmt_002
    // @invariant: INV-DTR-9
    // @covers: source_status::SurfaceSync (unknown variant), status_line
    // @deterministic: yes
    #[test]
    fn tst_desktop_trayfmt_002_unknown_variant_degrades_instead_of_going_dark() {
        // An eighth state the shell has never heard of must not fail to parse:
        // that would strand the tray on "unavailable" against a perfectly
        // healthy backend, and only a rebuild would fix it.
        let raw = r#"[{"source_id":"google","accounts":[{"display":"x",
            "state":{"state":"connected"},"surfaces":[
            {"state":"teleporting","surface":"email"}]}]}]"#;
        let parsed: Vec<SourceStatus> = serde_json::from_str(raw).expect("unknown variant parses");
        let surface = &parsed[0].accounts[0].surfaces[0];
        assert!(matches!(surface, SurfaceSync::Unknown));
        assert_eq!(surface.badge_count(), None);
        assert_eq!(status_line(&parsed), "Indexed 0 items · 1 need attention");

        // Additive FIELDS are ignored rather than fatal — the consumer must not
        // copy the producer's strictness.
        let extra = r#"[{"source_id":"google","brand_new_field":42,"accounts":[]}]"#;
        let parsed: Vec<SourceStatus> =
            serde_json::from_str(extra).expect("unknown fields are ignored");
        assert_eq!(status_line(&parsed), "No accounts connected");
    }
}
