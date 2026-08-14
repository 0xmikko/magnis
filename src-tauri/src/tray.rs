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

/// Turn one probe outcome into a status.
///
/// Pure so the mapping is testable: the interesting part is that distinct
/// causes stay distinct, which a live poll cannot demonstrate cheaply.
pub fn status_from_probe(outcome: Result<u16, String>) -> TrayStatus {
    match outcome {
        Ok(200) => TrayStatus::Ok {
            line: "Connected".to_string(),
        },
        Ok(401) => TrayStatus::Unavailable {
            reason: "not signed in".to_string(),
        },
        Ok(code) => TrayStatus::Unavailable {
            reason: format!("backend returned {code}"),
        },
        Err(e) => TrayStatus::Unavailable { reason: e },
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
        let health = format!("{}/health", base_url.trim_end_matches('/'));
        loop {
            let outcome = client
                .get(&health)
                .send()
                .map(|r| r.status().as_u16())
                .map_err(|e| e.to_string());
            let status = status_from_probe(outcome);
            update_status(&app, &status);
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
    use super::{menu_model, TrayStatus, TrayToggles};

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

    // @test-id: tst_desktop_probe_001
    // @invariant: INV-DTR-9
    // @covers: tray::status_from_probe
    // @deterministic: yes
    #[test]
    fn tst_desktop_probe_001_each_cause_reads_differently() {
        use super::status_from_probe;
        assert!(matches!(
            status_from_probe(Ok(200)),
            super::TrayStatus::Ok { .. }
        ));
        // A 401 must not read as "the backend is down" — the repair is
        // different, and collapsing them sends the user looking in the wrong
        // place.
        let unauth = status_from_probe(Ok(401));
        let down = status_from_probe(Err("connection refused".into()));
        let odd = status_from_probe(Ok(503));
        for s in [&unauth, &down, &odd] {
            assert!(matches!(s, super::TrayStatus::Unavailable { .. }));
        }
        let labels: Vec<String> = [&unauth, &down, &odd]
            .iter()
            .map(|s| match s {
                super::TrayStatus::Unavailable { reason } => reason.clone(),
                _ => unreachable!(),
            })
            .collect();
        assert_eq!(
            labels
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len(),
            3,
            "three distinct causes must produce three distinct reasons: {labels:?}"
        );
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
}
