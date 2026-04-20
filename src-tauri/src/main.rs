// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend_process;
mod commands;
mod paths;
mod workspace_config;

use backend_process::{pick_port, BackendProcessManager};
use commands::backend::get_backend_config;
use commands::oauth::open_oauth_window;
use commands::workspaces::{get_workspace_config, set_selected_workspace};
use paths::AppPaths;
use std::sync::Mutex;
use tauri::Manager;

/// Shared state for the backend process (spawned magnis-server). Used to expose base_url and to stop on exit.
pub struct BackendState(pub Mutex<BackendProcessManager>);

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let app_paths = AppPaths::init()?;
    println!("Magnis starting...");
    println!("App data dir: {:?}", app_paths.app_data_dir());
    println!("Database path: {:?}", app_paths.db_path());

    let port = pick_port();
    let backend = BackendProcessManager::start(app_paths.db_path(), port)?;
    println!("Backend server running at {}", backend.base_url());

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_paths)
        .manage(BackendState(Mutex::new(backend)))
        .invoke_handler(tauri::generate_handler![
            get_backend_config,
            get_workspace_config,
            set_selected_workspace,
            open_oauth_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            let state = app_handle.state::<BackendState>();
            if let Ok(mut guard) = state.0.lock() {
                guard.stop();
            };
        }
    });

    Ok(())
}
