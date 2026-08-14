// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend_process;
mod commands;
mod desktop_mode;
mod paths;
mod ports;
// Background-service install is macOS-only (DEC-10); on other OSes the desktop
// always uses Spawn mode and never references this module.
#[cfg(target_os = "macos")]
mod service;
mod workspace_config;

use backend_process::{BackendHandle, BackendProcessManager};
use commands::backend::get_backend_config;
use commands::oauth::open_oauth_window;
use commands::service::uninstall_background_service;
use commands::workspaces::{get_workspace_config, set_selected_workspace};
use desktop_mode::{resolve_mode, DesktopMode};
use paths::AppPaths;
use std::sync::Mutex;
use tauri::Manager;

/// Shared backend connection (spawned child or connect-only service). Exposes
/// `base_url` to the frontend and is stopped on exit (no-op in service mode).
pub struct BackendState(pub Mutex<BackendHandle>);

/// Acquire the backend per the resolved mode: spawn a child (dev) or install +
/// connect to the launchd services (packaged macOS).
fn build_backend(mode: DesktopMode, app_paths: &AppPaths) -> anyhow::Result<BackendHandle> {
    match mode {
        DesktopMode::Spawn => {
            // Bind before spawning: the port is HELD by this process until the
            // moment the child takes it, so a collision is detected here — with
            // a message naming the port — instead of surfacing as an opaque
            // bind failure from a child that has already been launched.
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
            let manager = BackendProcessManager::start(app_paths.data_root(), port)?;
            Ok(BackendHandle::Spawned(manager))
        }
        DesktopMode::Service => {
            #[cfg(target_os = "macos")]
            {
                let base_url =
                    service::install_and_wait_healthy(app_paths, env!("CARGO_PKG_VERSION"))?;
                Ok(BackendHandle::Service { base_url })
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = app_paths;
                anyhow::bail!("Service mode is only supported on macOS")
            }
        }
    }
}

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let app_paths = AppPaths::init()?;
    println!("Magnis starting...");
    println!("App data dir: {:?}", app_paths.app_data_dir());
    println!("Data root: {:?}", app_paths.data_root());

    let mode = resolve_mode(
        cfg!(debug_assertions),
        cfg!(target_os = "macos"),
        std::env::var("MAGNIS_DESKTOP_MODE").ok().as_deref(),
        desktop_mode::bundle_is_signed(),
    );
    println!("Desktop backend mode: {mode:?}");

    let backend = match build_backend(mode, &app_paths) {
        Ok(b) => b,
        Err(e) => {
            // Never disappear silently for a Finder-launched app — surface a
            // native dialog (e.g. "move Magnis to Applications") then exit.
            eprintln!("Startup failed: {e:?}");
            #[cfg(target_os = "macos")]
            service::show_startup_error(&e);
            return Err(e);
        }
    };
    println!("Backend base URL: {}", backend.base_url());

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_paths)
        .manage(BackendState(Mutex::new(backend)))
        .invoke_handler(tauri::generate_handler![
            get_backend_config,
            get_workspace_config,
            set_selected_workspace,
            open_oauth_window,
            uninstall_background_service
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            // Spawn mode: stop the child. Service mode: no-op — launchd keeps the
            // backend + agent running so background sync survives window close.
            let state = app_handle.state::<BackendState>();
            if let Ok(mut guard) = state.0.lock() {
                guard.stop();
            };
        }
    });

    Ok(())
}
