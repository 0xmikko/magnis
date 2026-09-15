//! Tauri bridge for an already selected local Ollama model.
//!
//! The command deliberately reports a verified provider endpoint to the web
//! client. Creating/updating the provider connection and materializing its
//! models stay in the backend AI Models control plane, where the existing
//! `OllamaProviderAdapter` and catalog already own those domain decisions.

use magnis_desktop::ollama::{
    discover_selected_local, reconcile_selected_local_handle, OllamaAction, OllamaAvailability,
    SystemOllamaProbe,
};
use magnis_desktop::paths::AppPaths;
use magnis_desktop::workspace_config::{load_desktop_prefs, save_desktop_prefs};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalOllamaRequest {
    pub model: String,
    pub action: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LocalOllamaStatus {
    Ready {
        base_url: String,
        models: Vec<String>,
        selected_model: String,
        owned_by_shell: bool,
    },
    NotRunning {
        base_url: String,
        can_start: bool,
    },
    NotInstalled {
        install_url: String,
    },
    Declined,
}

fn parse_action(raw: &str) -> Result<OllamaAction, String> {
    OllamaAction::from_wire(raw)
        .ok_or_else(|| format!("Ollama action must be {}", OllamaAction::WIRE_VALUES))
}

fn status(availability: OllamaAvailability, declined: bool) -> LocalOllamaStatus {
    if declined {
        return LocalOllamaStatus::Declined;
    }
    match availability {
        OllamaAvailability::Ready {
            base_url,
            models,
            selected_model,
            owned_by_shell,
        } => LocalOllamaStatus::Ready {
            base_url,
            models,
            selected_model,
            owned_by_shell,
        },
        OllamaAvailability::NotRunning {
            base_url,
            can_start,
        } => LocalOllamaStatus::NotRunning {
            base_url,
            can_start,
        },
        OllamaAvailability::NotInstalled { install_url } => {
            LocalOllamaStatus::NotInstalled { install_url }
        }
    }
}

/// Perform exactly the action the user chose for a local model. A `ready`
/// response contains the `.../v1` endpoint which the frontend passes to its
/// existing backend provider-connection control plane.
#[tauri::command]
pub async fn prepare_local_ollama(
    app: tauri::AppHandle,
    paths: tauri::State<'_, AppPaths>,
    state: tauri::State<'_, crate::OllamaState>,
    request: LocalOllamaRequest,
) -> Result<LocalOllamaStatus, String> {
    let action = parse_action(&request.action)?;
    let prefs_path = paths.desktop_prefs_path();
    let mut prefs = load_desktop_prefs(&prefs_path);
    if matches!(
        action,
        OllamaAction::Decline | OllamaAction::OpenInstall | OllamaAction::StartInstalled
    ) && !prefs.ollama_setup_prompted
    {
        // Persist BEFORE opening/installing/spawning. A crash during the
        // external action must not make the one-time prompt recur next launch.
        prefs.ollama_setup_prompted = true;
        save_desktop_prefs(&prefs_path, &prefs).map_err(|error| error.to_string())?;
    }

    let mut probe = SystemOllamaProbe::new().map_err(|error| error.to_string())?;
    let mut launch = discover_selected_local(
        &mut probe,
        &request.model,
        prefs.ollama_setup_prompted,
        action,
    )
    .map_err(|error| error.to_string())?;
    let mut availability = launch.availability().clone();

    if action == OllamaAction::OpenInstall {
        let OllamaAvailability::NotInstalled { install_url } = &availability else {
            return Err(
                "Ollama install action requires an unavailable local installation".to_string(),
            );
        };
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_url(install_url, None::<String>)
            .map_err(|error| error.to_string())?;
    }

    if let Some(handle) = launch.take_handle() {
        let mut current = state.0.lock().map_err(|error| error.to_string())?;
        reconcile_selected_local_handle(&mut current, handle, &mut availability);
    }
    Ok(status(availability, launch.was_declined()))
}

/// Stop only the `ollama serve` child this command itself started. An external
/// daemon is represented by the same state type but its `stop` is a no-op.
pub fn stop_owned_ollama(state: &crate::OllamaState) {
    if let Ok(mut current) = state.0.lock() {
        if let Some(handle) = current.as_mut() {
            handle.stop();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_action, status, LocalOllamaStatus};
    use magnis_desktop::ollama::{OllamaAction, OllamaAvailability};

    #[test]
    fn tst_desktop_ollama_ipc_001_reports_only_the_existing_provider_endpoint() {
        assert_eq!(parse_action("start"), Ok(OllamaAction::StartInstalled));
        assert_eq!(parse_action("check"), Ok(OllamaAction::Check));
        assert!(parse_action("hosted-fallback").is_err());
        assert!(matches!(
            status(
                OllamaAvailability::Ready {
                    base_url: "http://127.0.0.1:11434/v1".to_string(),
                    models: vec!["llama3.2".to_string()],
                    selected_model: "llama3.2".to_string(),
                    owned_by_shell: false,
                },
                false,
            ),
            LocalOllamaStatus::Ready { base_url, .. } if base_url == "http://127.0.0.1:11434/v1"
        ));
    }
}
