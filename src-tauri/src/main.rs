// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend_process;
mod commands;
mod paths;
mod ports;
mod postgres;
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
fn build_backend(app_paths: &AppPaths) -> anyhow::Result<BackendHandle> {
    // Order is fixed (DEC-9): PostgreSQL first, then the backend — the child
    // needs a reachable DATABASE_URL the moment it boots.
    let pg_port = ports::bind_port("postgres", None)?.release();
    println!("PostgreSQL port: {pg_port}");
    let cluster = postgres::PostgresHandle::start(app_paths.data_root(), pg_port)?;

    // Bind before spawning: the port is HELD by this process until the moment
    // the child takes it, so a collision is detected here — with a message
    // naming the port — instead of surfacing as an opaque bind failure from a
    // child that has already been launched.
    let pin = ports::parse_pin("backend", std::env::var("MAGNIS_BACKEND_PORT").ok())?;
    let reserved = ports::bind_port("backend", pin)?;
    println!(
        "Backend port: {} ({})",
        reserved.port(),
        match pin {
            Some(_) => "pinned via MAGNIS_BACKEND_PORT",
            None => "bound free",
        }
    );
    let port = reserved.release();
    let manager =
        BackendProcessManager::start(app_paths.data_root(), port, &cluster.database_url())?;

    Ok(BackendHandle::spawned(manager, cluster))
}

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let app_paths = AppPaths::init()?;
    println!("Magnis starting...");
    println!("App data dir: {:?}", app_paths.app_data_dir());
    println!("Data root: {:?}", app_paths.data_root());

    let backend = match build_backend(&app_paths) {
        Ok(b) => b,
        Err(e) => {
            // A startup failure must reach the user even with no window. The
            // dialog that used to live in the deleted launchd tree is gone;
            // until the tray carries the error state (DEC-31), stderr plus a
            // non-zero exit is the honest surface — silently disappearing is
            // the one outcome that is never acceptable.
            eprintln!("Startup failed: {e:?}");
            return Err(e);
        }
    };
    let poll_url = backend.base_url().to_string();
    println!("Backend base URL: {poll_url}");

    let app = tauri::Builder::default()
        // FIRST, as the plugin's docs require. A second launch must collapse
        // into the running instance: two copies would be two owners of one data
        // directory, and the second would fail on the lock anyway — but late,
        // and after having tried to touch it.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_paths)
        .manage(BackendState(Mutex::new(backend)))
        .setup(move |app| {
            // Toggle state is not persisted yet — D3 adds that together with
            // Login Items. Passing today's values keeps the menu honest rather
            // than inventing storage before it is used.
            tray::build(
                app.handle(),
                &tray::TrayStatus::Starting,
                tray::TrayToggles {
                    show_in_dock: true,
                    start_at_login: false,
                },
            )?;
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
