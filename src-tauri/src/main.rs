// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend_process;
mod commands;
mod logging;
mod paths;
mod ports;
mod postgres;
mod source_status;
mod startup;
mod tray;
mod workspace_config;

use backend_process::{BackendHandle, BackendProcessManager};
use commands::backend::get_backend_config;
use commands::oauth::open_oauth_window;
use commands::workspaces::{get_workspace_config, set_selected_workspace};
use paths::AppPaths;
use std::sync::Mutex;
use tauri::Manager;

/// The backend connection the frontend reads `base_url` from. Stopped on exit.
pub struct BackendState(pub Mutex<BackendHandle>);

/// Bring up everything the shell owns, in the one order that works.
///
/// There is no mode to resolve any more. The launchd path is gone (DEC-1): a
/// LaunchAgent belonging to an unsigned app lands in Background Task Management
/// *disabled* and launchd silently refuses to run it, which is unobservable
/// from inside the app — it only ever surfaced as "the backend never became
/// healthy". One owner, one topology.
fn build_backend(
    app_paths: &AppPaths,
    runtime_root: &std::path::Path,
) -> anyhow::Result<BackendHandle> {
    // Order is fixed (DEC-9): PostgreSQL first, then the backend — the child
    // needs a reachable DATABASE_URL the moment it boots.
    let pg_port = ports::bind_port("postgres", None)?.release();
    tracing::info!(target: "shell", pg_port, "PostgreSQL port bound");
    let cluster = postgres::PostgresHandle::start(app_paths.data_root(), pg_port)?;

    // Bind before spawning: the port is HELD by this process until the moment
    // the child takes it, so a collision is detected here — with a message
    // naming the port — instead of surfacing as an opaque bind failure from a
    // child that has already been launched.
    let pin = ports::parse_pin("backend", std::env::var("MAGNIS_BACKEND_PORT").ok())?;
    let reserved = ports::bind_port("backend", pin)?;
    tracing::info!(
        target: "shell",
        port = reserved.port(),
        how = match pin {
            Some(_) => "pinned via MAGNIS_BACKEND_PORT",
            None => "bound free",
        },
        "backend port bound"
    );
    let port = reserved.release();
    let manager = BackendProcessManager::start(
        app_paths.data_root(),
        port,
        &cluster.database_url(),
        runtime_root,
    )?;

    Ok(BackendHandle::spawned(manager, cluster))
}

fn main() -> anyhow::Result<()> {
    let app_paths = AppPaths::init()?;
    // The shell's own log lives beside the backend's, in `<data_root>/logs`
    // (DEC-16). Nothing above this line logs; `AppPaths::init` failures stay
    // anyhow-on-stderr from `main`.
    logging::init_logging(app_paths.logs_dir())?;
    tracing::info!(
        target: "shell",
        app_data_dir = %app_paths.app_data_dir().display(),
        data_root = %app_paths.data_root().display(),
        "Magnis starting"
    );

    let app = tauri::Builder::default()
        // FIRST, as the plugin's docs require. A second launch must collapse
        // into the running instance: two copies would be two owners of one data
        // directory, and the second would fail on the lock anyway — but late,
        // and after having tried to touch it.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![startup::QUIET_FLAG]),
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_paths)
        .setup(|app| {
            use tauri::Manager;

            // Preferences first — the tray renders their state, and the tray
            // must exist before anything that can fail.
            let prefs_path = app.state::<AppPaths>().desktop_prefs_path();
            let mut prefs = workspace_config::load_desktop_prefs(&prefs_path);
            let autolaunch_enabled = {
                use tauri_plugin_autostart::ManagerExt;
                app.autolaunch().is_enabled().unwrap_or(false)
            };

            // The tray is built BEFORE the parts of startup that can fail.
            // Quiet start has no window and no console, so a failure after this
            // point needs somewhere to be seen — and the dialog that used to do
            // that was deleted with the launchd tree (DEC-31).
            tray::build(
                app.handle(),
                &tray::TrayStatus::Starting,
                tray::TrayToggles {
                    show_in_dock: prefs.show_in_dock,
                    start_at_login: autolaunch_enabled,
                },
            )?;
            startup::apply_dock_visibility(app.handle(), prefs.show_in_dock);

            // Startup happens HERE, not before the Builder: the single-instance
            // plugin is registered above, so a second launch has already been
            // collapsed into the running one. Starting earlier meant the second
            // copy bound ports and hit the data-dir lock before the plugin
            // could speak, exiting with an error while the running window was
            // never raised.
            // The payload's home, from the one API that is right both in
            // development and inside a package. `resource_dir()` is the exe's
            // own directory in a Cargo build — where `tauri-build` copies the
            // declared resources — and the platform resource root once bundled.
            let runtime_root = anyhow::Context::context(
                app.path().resource_dir(),
                "Could not resolve the resource directory",
            )?
            .join(backend_process::PAYLOAD_SUBDIR);

            let backend = match build_backend(&app.state::<AppPaths>(), &runtime_root) {
                Ok(b) => b,
                Err(e) => {
                    // Report and STAY UP. Exiting here is what made a failed
                    // launch from Login Items vanish without a trace. The tray
                    // carries the reason, a dialog says it out loud, and the
                    // user can quit from the menu.
                    let (title, body) = tray::startup_error_dialog(&format!("{e:#}"));
                    tracing::error!(target: "shell", error = ?e, "startup failed");
                    tray::show_startup_failure(app.handle(), &body);
                    {
                        use tauri_plugin_dialog::DialogExt;
                        app.dialog().message(&body).title(&title).blocking_show();
                    }
                    return Ok(());
                }
            };
            let poll_url = backend.base_url().to_string();
            tracing::info!(target: "shell", url = %poll_url, "backend base URL");
            app.manage(BackendState(Mutex::new(backend)));
            use tauri_plugin_autostart::ManagerExt;

            // Enable Start-at-Login once, and only from somewhere the bundle
            // will still be after a reboot. Enabling from a mounted image or a
            // translocated quarantine path records a login item that breaks on
            // eject — and because we never re-enable, that break is permanent.
            let autolaunch = app.autolaunch();
            let currently_enabled = autolaunch_enabled;
            let persistent = std::env::current_exe()
                .ok()
                .map(|exe| startup::is_persistent_location(&exe))
                .unwrap_or(false);
            if startup::should_enable_autostart(
                prefs.autostart_decided,
                currently_enabled,
                persistent,
            ) {
                match autolaunch.enable() {
                    Ok(()) => {
                        prefs.autostart_decided = true;
                        if let Err(e) = workspace_config::save_desktop_prefs(&prefs_path, &prefs) {
                            tracing::warn!(target: "shell", error = %e, "could not record the autostart decision");
                        }
                    }
                    Err(e) => tracing::warn!(target: "shell", error = %e, "could not enable Start at Login"),
                }
            }

            // Quiet start: Login Items launches with the flag, and the window
            // is simply never shown. The window is created hidden either way,
            // so there is one code path and no race with the tray.
            if startup::should_create_window(std::env::args()) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                }
            } else {
                tracing::info!(target: "shell", "quiet start: running in the status bar with no window");
            }

            startup::apply_dock_visibility(app.handle(), prefs.show_in_dock);
            tray::spawn_status_poll(app.handle().clone(), poll_url.clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Closing the window hides it; the app keeps running in the
                // status bar and the backend keeps indexing. The only exit is
                // the tray's Quit.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_backend_config,
            get_workspace_config,
            set_selected_workspace,
            open_oauth_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // macOS: clicking the dock icon of a running app with no visible window.
        // Every other platform reaches the same place through the
        // single-instance callback above.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } = event
        {
            tray::show_main_window(app_handle);
        }

        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            // The shell owns both children; stop them in order (DEC-9).
            let state = app_handle.state::<BackendState>();
            if let Ok(mut guard) = state.0.lock() {
                guard.stop();
            };
        }
    });

    Ok(())
}
