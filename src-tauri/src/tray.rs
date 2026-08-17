//! The status-bar item: what the app is when no window is open.
//!
//! The menu is the primary interaction, not the click (DEC-16). Tauri documents
//! Linux tray mouse events as never emitted — "the event is not emitted even
//! though the icon is shown and will still show a context menu on right click"
//! — so a design where clicking the icon is the way in would leave Linux with
//! no way in at all. **Open Magnis** is therefore the first menu item
//! everywhere, and left-click-to-open is an extra convenience where it works.

/// A menu entry, as data. Modelled separately from Tauri's builder so the shape
/// of the menu is testable without an `AppHandle` — the alternative is asserting
/// nothing until a GUI exists.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MenuEntry {
    pub id: &'static str,
    pub label: String,
    /// `Some(checked)` renders a checkbox; `None` a plain item.
    pub checked: Option<bool>,
    pub enabled: bool,
}

impl MenuEntry {
    fn item(id: &'static str, label: impl Into<String>) -> Self {
        Self {
            id,
            label: label.into(),
            checked: None,
            enabled: true,
        }
    }

    fn check(id: &'static str, label: impl Into<String>, checked: bool) -> Self {
        Self {
            id,
            label: label.into(),
            checked: Some(checked),
            enabled: true,
        }
    }

    fn disabled(id: &'static str, label: impl Into<String>) -> Self {
        Self {
            id,
            label: label.into(),
            checked: None,
            enabled: false,
        }
    }
}

/// What the tray currently knows about the backend.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TrayStatus {
    /// Nothing polled yet.
    Starting,
    /// Startup itself failed. Distinct from `Unavailable`, which means a
    /// running app cannot reach a backend: this one means there is no backend
    /// and never was. Quiet start has no window and no console, so without a
    /// tray state a failed launch from Login Items vanishes with no trace.
    FailedToStart { reason: String },
    /// A successful poll. `line` is already rendered for display.
    Ok { line: String },
    /// The backend answered, but not usefully — or did not answer at all.
    /// Carries its own text so distinct causes stay distinguishable instead of
    /// collapsing into one opaque "something is wrong".
    Unavailable { reason: String },
}

impl TrayStatus {
    fn label(&self) -> String {
        match self {
            TrayStatus::Starting => "Starting…".to_string(),
            TrayStatus::FailedToStart { reason } => format!("Could not start — {reason}"),
            TrayStatus::Ok { line } => line.clone(),
            TrayStatus::Unavailable { reason } => format!("Unavailable — {reason}"),
        }
    }
}

/// User-facing toggles the tray owns.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrayToggles {
    pub show_in_dock: bool,
    pub start_at_login: bool,
}

/// The whole menu, as data.
///
/// `Open Magnis` is index 0 by construction, and the status line sits directly
/// under it as a disabled item — it is information, not an action.
pub fn menu_model(status: &TrayStatus, toggles: TrayToggles) -> Vec<MenuEntry> {
    vec![
        MenuEntry::item("open", "Open Magnis"),
        MenuEntry::disabled("status", status.label()),
        MenuEntry::check("show_in_dock", "Show in Dock", toggles.show_in_dock),
        MenuEntry::check("start_at_login", "Start at Login", toggles.start_at_login),
        MenuEntry::item("quit", "Quit Magnis"),
    ]
}

/// Build the real tray item from the model above.
///
/// Everything about *what* the menu contains lives in `menu_model`, which is
/// data and is tested. This function only turns that data into Tauri objects,
/// so the part that can be wrong in an interesting way is not trapped behind an
/// `AppHandle`.
pub fn build(
    app: &tauri::AppHandle,
    status: &TrayStatus,
    toggles: TrayToggles,
) -> tauri::Result<tauri::tray::TrayIcon> {
    use tauri::menu::{CheckMenuItem, Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;

    let model = menu_model(status, toggles);
    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<_>>> = Vec::new();
    let mut status_item: Option<MenuItem<tauri::Wry>> = None;
    for entry in &model {
        match entry.checked {
            Some(checked) => items.push(Box::new(CheckMenuItem::with_id(
                app,
                entry.id,
                &entry.label,
                entry.enabled,
                checked,
                None::<&str>,
            )?)),
            None => {
                let item =
                    MenuItem::with_id(app, entry.id, &entry.label, entry.enabled, None::<&str>)?;
                if entry.id == "status" {
                    status_item = Some(item.clone());
                }
                items.push(Box::new(item));
            }
        }
    }
    let refs: Vec<&dyn tauri::menu::IsMenuItem<_>> = items.iter().map(|i| i.as_ref()).collect();
    let menu = Menu::with_items(app, &refs)?;
    if let Some(item) = status_item {
        use tauri::Manager;
        app.manage(StatusItem(item));
    }

    TrayIconBuilder::with_id("magnis-tray")
        .icon(
            app.default_window_icon()
                .cloned()
                .ok_or_else(|| tauri::Error::UnknownPath)?,
        )
        .menu(&menu)
        // Left-click opens the window where the platform reports clicks at all.
        // Linux never emits them, which is why the menu carries `Open Magnis`
        // as its first item rather than relying on this.
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            "show_in_dock" => toggle_show_in_dock(app),
            "start_at_login" => toggle_start_at_login(app),
            _ => {}
        })
        .build(app)
}

/// Flip Dock/taskbar visibility and remember it. A checkbox that does nothing
/// when clicked is worse than no checkbox.
fn toggle_show_in_dock(app: &tauri::AppHandle) {
    use tauri::Manager;
    let path = app.state::<crate::paths::AppPaths>().desktop_prefs_path();
    let mut prefs = crate::workspace_config::load_desktop_prefs(&path);
    prefs.show_in_dock = !prefs.show_in_dock;
    crate::startup::apply_dock_visibility(app, prefs.show_in_dock);
    if let Err(e) = crate::workspace_config::save_desktop_prefs(&path, &prefs) {
        eprintln!("magnis: could not save the Dock preference: {e}");
    }
}

/// Flip Start-at-Login. The user's choice from here is final: nothing
/// re-enables it later.
fn toggle_start_at_login(app: &tauri::AppHandle) {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let enabled = manager.is_enabled().unwrap_or(false);
    let result = if enabled {
        manager.disable()
    } else {
        manager.enable()
    };
    if let Err(e) = result {
        eprintln!("magnis: could not change Start at Login: {e}");
    }
}

/// Turn a startup error into the title and body a user should see.
///
/// Re-homed from the deleted launchd tree, where it was the one piece of that
/// subsystem worth keeping: a guard failure gets actionable copy, and anything
/// else keeps its underlying text rather than being flattened into a shrug.
/// Pure, so the mapping is testable without a GUI.
pub fn startup_error_dialog(error: &str) -> (String, String) {
    if error.contains("/Applications") || error.contains("persistent") {
        return (
            "Move Magnis to Applications".to_string(),
            "Magnis is running from a temporary location. Drag it to your \
             Applications folder and open it again."
                .to_string(),
        );
    }
    if error.contains("another Magnis instance") || error.contains("data-dir lock") {
        return (
            "Magnis is already running".to_string(),
            "Another copy of Magnis owns this data folder. Quit it first.".to_string(),
        );
    }
    (
        "Magnis could not start".to_string(),
        // The underlying text is preserved deliberately: a generic message
        // here is what turns a diagnosable failure into a support ticket.
        error.to_string(),
    )
}

/// Drive the tray into its startup-failure state.
///
/// The surface that replaced the deleted launchd dialog. It is reachable only
/// because the tray is built BEFORE the parts of startup that can fail — the
/// ordering is the whole point, not an implementation detail.
pub fn show_startup_failure(app: &tauri::AppHandle, reason: &str) {
    update_status(
        app,
        &TrayStatus::FailedToStart {
            reason: reason.to_string(),
        },
    );
}

/// Bring the window back. Used by the tray, by a second launch, and by the
/// macOS dock click — three entry points, one behaviour.
pub fn show_main_window(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// How often the tray asks the backend how it is doing.
const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_secs(10);

/// What one poll produced.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PollOutcome {
    /// Parsed, with a rendered line.
    Ok(String),
    /// The token was rejected.
    Unauthorized,
    /// Reached the backend, got something unusable.
    BadResponse(String),
    /// Did not reach the backend.
    Transport(String),
}

/// What to do next, given the outcome and how many 401s came before it.
///
/// A counter and an effect cannot live in a formatter, which is why this is its
/// own function. Both halves are the bug: a counter that never resets turns one
/// 401 a week into a permanent error state on the second week, and an unbounded
/// retry hammers the login endpoint in a loop.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PollAction {
    Show(TrayStatus),
    /// Re-login, then show this if the retry also fails.
    Reauthenticate,
}

pub fn on_poll_outcome(consecutive_401s: u32, outcome: PollOutcome) -> (u32, PollAction) {
    match outcome {
        PollOutcome::Ok(line) => (0, PollAction::Show(TrayStatus::Ok { line })),
        PollOutcome::Unauthorized if consecutive_401s == 0 => (1, PollAction::Reauthenticate),
        PollOutcome::Unauthorized => (
            consecutive_401s + 1,
            PollAction::Show(TrayStatus::Unavailable {
                reason: "not signed in".to_string(),
            }),
        ),
        PollOutcome::BadResponse(what) => (
            0,
            PollAction::Show(TrayStatus::Unavailable {
                reason: format!("unreadable response: {what}"),
            }),
        ),
        PollOutcome::Transport(e) => (
            0,
            PollAction::Show(TrayStatus::Unavailable {
                reason: format!("backend unreachable: {e}"),
            }),
        ),
    }
}

/// Ask the backend for an access token. Open mode accepts an empty body, which
/// is the documented path for a desktop shell.
fn login(client: &reqwest::blocking::Client, base: &str) -> Option<String> {
    let resp = client
        .post(format!("{base}/api/auth/login"))
        .json(&serde_json::json!({}))
        .send()
        .ok()?;
    let body: serde_json::Value = resp.json().ok()?;
    body.get("token")
        .or_else(|| body.get("access_token"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

/// One authenticated `source.status.list` call.
fn poll_once(client: &reqwest::blocking::Client, base: &str, token: &str) -> PollOutcome {
    let resp = match client
        .post(format!("{base}/api/rpc"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "method": "source.status.list", "params": {} }))
        .send()
    {
        Ok(r) => r,
        Err(e) => return PollOutcome::Transport(e.to_string()),
    };
    if resp.status().as_u16() == 401 {
        return PollOutcome::Unauthorized;
    }
    if !resp.status().is_success() {
        return PollOutcome::BadResponse(format!("status {}", resp.status().as_u16()));
    }
    let body: serde_json::Value = match resp.json() {
        Ok(v) => v,
        Err(e) => return PollOutcome::BadResponse(e.to_string()),
    };
    // The RPC envelope carries the payload under `result`; accept the bare
    // array too rather than guessing which one this build uses.
    let payload = body.get("result").unwrap_or(&body);
    match serde_json::from_value::<Vec<crate::source_status::SourceStatus>>(payload.clone()) {
        Ok(sources) => PollOutcome::Ok(crate::source_status::status_line(&sources)),
        Err(e) => PollOutcome::BadResponse(e.to_string()),
    }
}

/// Poll the backend and keep the tray's status line current.
///
/// Runs on its own thread: a blocking HTTP client on the UI thread would freeze
/// the menu for the duration of a timeout, which is exactly when the user is
/// most likely to be opening it.
pub fn spawn_status_poll(app: tauri::AppHandle, base_url: String) {
    std::thread::spawn(move || {
        let client = match reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                eprintln!("magnis: tray status poll disabled: {e}");
                return;
            }
        };
        let base = base_url.trim_end_matches('/').to_string();
        let mut token = login(&client, &base);
        let mut consecutive_401s = 0u32;
        loop {
            // Re-login when there is no token at all. Without this the loop
            // wedges: no token maps to Unauthorized, the counter climbs past
            // its one retry, and nothing ever tries again — the permanent red
            // light INV-DTR-28 exists to prevent, reached by the other door.
            if token.is_none() {
                token = login(&client, &base);
            }
            let outcome = match token.as_deref() {
                Some(t) => poll_once(&client, &base, t),
                None => PollOutcome::Transport("cannot sign in to the backend".to_string()),
            };
            let (next_count, action) = on_poll_outcome(consecutive_401s, outcome);
            consecutive_401s = next_count;
            match action {
                PollAction::Show(status) => update_status(&app, &status),
                PollAction::Reauthenticate => {
                    // Tokens expire; the tray runs for weeks. One retry, then
                    // the error state — otherwise a weekly expiry becomes a
                    // permanent red light only a relaunch can clear.
                    token = login(&client, &base);
                    continue;
                }
            }
            std::thread::sleep(POLL_INTERVAL);
        }
    });
}

/// The status line, kept so the poll can rewrite it without re-reading the menu
/// back out of the tray — which Tauri does not offer.
pub struct StatusItem(pub tauri::menu::MenuItem<tauri::Wry>);

/// Re-render the status line in place.
fn update_status(app: &tauri::AppHandle, status: &TrayStatus) {
    use tauri::Manager;
    if let Some(item) = app.try_state::<StatusItem>() {
        let _ = item.0.set_text(status.label());
    }
}

#[cfg(test)]
mod tests {
    use super::{menu_model, startup_error_dialog, TrayStatus, TrayToggles};

    const TOGGLES: TrayToggles = TrayToggles {
        show_in_dock: true,
        start_at_login: false,
    };

    // @test-id: tst_desktop_menu_001
    // @invariant: INV-DTR-15 (Open Magnis reachable without a click event)
    // @covers: tray::menu_model
    // @deterministic: yes
    #[test]
    fn tst_desktop_menu_001_open_is_reachable_from_the_menu() {
        let menu = menu_model(&TrayStatus::Starting, TOGGLES);

        // The property is reachability from the MENU — the only path that
        // exists on every platform. Position is asserted too because a status
        // line above the action would bury it.
        assert_eq!(menu[0].id, "open", "Open Magnis must lead the menu");
        assert!(menu[0].enabled);
        assert!(
            menu.iter().any(|e| e.id == "quit"),
            "Quit is the single exit path and must always be present"
        );

        // The status line is information, never something to click.
        let status = menu
            .iter()
            .find(|e| e.id == "status")
            .expect("status entry");
        assert!(!status.enabled);
        assert_eq!(status.label, "Starting…");

        // Toggles render their state.
        let dock = menu
            .iter()
            .find(|e| e.id == "show_in_dock")
            .expect("dock toggle");
        assert_eq!(dock.checked, Some(true));
        let login = menu
            .iter()
            .find(|e| e.id == "start_at_login")
            .expect("login toggle");
        assert_eq!(login.checked, Some(false));
    }

    // @test-id: tst_desktop_reauth_001
    // @invariant: INV-DTR-28 (one re-login, counter resets on success)
    // @covers: tray::on_poll_outcome
    // @deterministic: yes
    #[test]
    fn tst_desktop_reauth_001_one_retry_then_the_error_state() {
        use super::{on_poll_outcome, PollAction, PollOutcome};

        // First 401: retry, do NOT show an error yet.
        let (count, action) = on_poll_outcome(0, PollOutcome::Unauthorized);
        assert_eq!(count, 1);
        assert_eq!(action, PollAction::Reauthenticate);

        // Second consecutive 401: the retry did not help, so say so.
        let (count, action) = on_poll_outcome(count, PollOutcome::Unauthorized);
        assert_eq!(count, 2);
        assert!(matches!(
            action,
            PollAction::Show(super::TrayStatus::Unavailable { .. })
        ));

        // A success RESETS the counter. Without this a single 401 a week makes
        // the second week a permanent error state.
        let (count, action) = on_poll_outcome(count, PollOutcome::Ok("Connected".into()));
        assert_eq!(count, 0, "a good poll must clear the 401 streak");
        assert!(matches!(
            action,
            PollAction::Show(super::TrayStatus::Ok { .. })
        ));

        // Non-auth failures never trigger a login attempt, and stay distinct.
        for outcome in [
            PollOutcome::Transport("refused".into()),
            PollOutcome::BadResponse("garbage".into()),
        ] {
            let (count, action) = on_poll_outcome(0, outcome);
            assert_eq!(count, 0);
            match action {
                PollAction::Show(super::TrayStatus::Unavailable { reason }) => {
                    assert!(!reason.contains("not signed in"), "wrong cause: {reason}");
                }
                other => panic!("expected an unavailable state, got {other:?}"),
            }
        }
    }

    // @test-id: tst_desktop_traystatus_001
    // @invariant: INV-DTR-9 (never a stale value shown as current)
    // @covers: tray::TrayStatus
    // @deterministic: yes
    #[test]
    fn tst_desktop_traystatus_001_distinct_causes_stay_distinct() {
        let good = TrayStatus::Ok {
            line: "Synced · 12 480 items".to_string(),
        };
        let menu = menu_model(&good, TOGGLES);
        assert_eq!(menu[1].label, "Synced · 12 480 items");

        // A failed poll must replace the good line, not leave it standing. This
        // is the trap the invariant exists for: a stale number reads as current.
        for (reason, expected) in [
            ("not signed in", "Unavailable — not signed in"),
            ("backend unreachable", "Unavailable — backend unreachable"),
            ("unreadable response", "Unavailable — unreadable response"),
        ] {
            let bad = TrayStatus::Unavailable {
                reason: reason.to_string(),
            };
            let menu = menu_model(&bad, TOGGLES);
            assert_eq!(menu[1].label, expected);
            assert_ne!(
                menu[1].label, "Synced · 12 480 items",
                "a failure must never keep rendering the last good line"
            );
        }
    }

    // @test-id: tst_desktop_startupfail_001
    // @invariant: INV-DTR-27
    // @covers: tray::startup_error_dialog, tray::TrayStatus::FailedToStart
    // @deterministic: yes
    //
    // Restores the coverage of the deleted `tst_desktop_dialog_001`. A failed
    // start under quiet launch has no window and no console, so this mapping is
    // the entire user-visible account of what went wrong.
    #[test]
    fn tst_desktop_startupfail_001_a_failed_start_says_why() {
        // The guard case earns copy that names the fix. Matching on the message
        // is what makes "move it to Applications" reachable at all.
        let (title, body) =
            startup_error_dialog("refusing to start: /Volumes/Magnis is not /Applications");
        assert!(
            title.contains("Applications") && body.contains("Applications"),
            "the install-location guard must say what to do, got {title:?} / {body:?}"
        );

        // Everything else keeps its own text. Flattening an arbitrary failure
        // into a generic apology is what turns a diagnosable bug into a
        // support ticket, so the underlying words must survive verbatim.
        let raw = "postgres exited with status 1: could not bind port 5432";
        let (title, body) = startup_error_dialog(raw);
        assert!(!title.is_empty(), "a dialog with no title is not a dialog");
        assert!(
            body.contains(raw),
            "the underlying failure must be preserved, got {body:?}"
        );

        // And the tray must carry the same reason: the dialog is dismissed once,
        // the menu is where the user looks afterwards.
        let entries = menu_model(
            &TrayStatus::FailedToStart {
                reason: raw.to_string(),
            },
            TrayToggles {
                show_in_dock: true,
                start_at_login: false,
            },
        );
        let labels: Vec<&str> = entries.iter().map(|e| e.label.as_str()).collect();
        assert!(
            labels.iter().any(|l| l.contains(raw)),
            "the failure reason must be visible in the menu, got {labels:?}"
        );
        assert!(
            entries.iter().any(|e| e.id == "quit"),
            "a failed start must still be quittable from the tray"
        );
    }
}
