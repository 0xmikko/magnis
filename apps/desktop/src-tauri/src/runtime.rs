//! The single process-orchestration library shared by the Tauri UI and the
//! headless `magnis-runtime` binary.

use crate::backend_process::{BackendHandle, BackendProcessManager};
use crate::ollama::{
    discover_selected_local, hosted_launch, OllamaAction, OllamaAvailability, OllamaHandle,
    OllamaProbe, SystemOllamaProbe,
};
use crate::paths::AppPaths;
use crate::{ports, postgres};
use anyhow::{Context, Result};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelSelection {
    Hosted,
    Local {
        model: String,
        action: OllamaAction,
        setup_prompted: bool,
    },
}

/// Everything the shell owns for one launch. The backend/cluster pair shuts
/// down before a user-authorized Ollama child, so the backend never loses its
/// selected provider while it is still draining. Adopted daemons remain
/// untouched in either order.
pub struct RuntimeHandle {
    backend: BackendHandle,
    ollama: Option<OllamaHandle>,
}

impl RuntimeHandle {
    pub fn base_url(&self) -> &str {
        self.backend.base_url()
    }

    pub fn stop(&mut self) {
        self.backend.stop();
        if let Some(ollama) = self.ollama.as_mut() {
            ollama.stop();
        }
    }
}

impl Drop for RuntimeHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Start the complete local runtime. A failed selected-local Ollama setup is
/// returned before PostgreSQL or the backend are started; it is never replaced
/// by a hosted model selection.
pub fn start(
    app_paths: &AppPaths,
    runtime_root: &Path,
    selection: ModelSelection,
) -> Result<RuntimeHandle> {
    match &selection {
        ModelSelection::Hosted => start_with_probe(selection, None, |ollama_base_url, ollama| {
            start_infrastructure(app_paths, runtime_root, ollama_base_url, ollama)
        }),
        ModelSelection::Local { .. } => {
            let mut probe = SystemOllamaProbe::new()?;
            start_with_probe(selection, Some(&mut probe), |ollama_base_url, ollama| {
                start_infrastructure(app_paths, runtime_root, ollama_base_url, ollama)
            })
        }
    }
}

fn start_with_probe(
    selection: ModelSelection,
    probe: Option<&mut dyn OllamaProbe>,
    start_infrastructure: impl FnOnce(Option<&str>, Option<OllamaHandle>) -> Result<RuntimeHandle>,
) -> Result<RuntimeHandle> {
    let (ollama, ollama_base_url) = match selection {
        ModelSelection::Hosted => {
            let launch = hosted_launch();
            debug_assert!(launch.is_hosted());
            (None, None)
        }
        ModelSelection::Local {
            model,
            action,
            setup_prompted,
        } => {
            let probe = probe.context("local Ollama selection requires a discovery probe")?;
            let mut launch = discover_selected_local(probe, &model, setup_prompted, action)?;
            let availability = launch.availability().clone();
            let OllamaAvailability::Ready { base_url, .. } = availability else {
                anyhow::bail!(
                    "selected local Ollama model is unavailable: {availability:?}; setup must be completed explicitly"
                );
            };
            let handle = launch.take_handle();
            (handle, Some(base_url))
        }
    };

    start_infrastructure(ollama_base_url.as_deref(), ollama)
}

fn start_infrastructure(
    app_paths: &AppPaths,
    runtime_root: &Path,
    ollama_base_url: Option<&str>,
    ollama: Option<OllamaHandle>,
) -> Result<RuntimeHandle> {
    // PostgreSQL starts first because the backend needs its reachable URL at
    // process creation. Any failure below drops the cluster through its handle.
    let pg_port = ports::bind_port("postgres", None)?.release();
    tracing::info!(target: "shell", pg_port, "PostgreSQL port bound");
    let cluster = postgres::PostgresHandle::start(app_paths.data_root(), pg_port)?;

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
        ollama_base_url,
    )?;

    Ok(RuntimeHandle {
        backend: BackendHandle::spawned(manager, cluster),
        ollama,
    })
}

#[cfg(test)]
mod tests {
    use super::{start_with_probe, ModelSelection};
    use crate::ollama::{OllamaAction, OllamaHandle, OllamaProbe};
    use anyhow::Result;
    use std::path::{Path, PathBuf};

    struct UnavailableProbe;

    impl OllamaProbe for UnavailableProbe {
        fn tags(&mut self) -> Result<Option<Vec<String>>> {
            Ok(None)
        }

        fn installed_binary(&mut self) -> Result<Option<PathBuf>> {
            Ok(None)
        }

        fn start(&mut self, _binary: &Path) -> Result<OllamaHandle> {
            unreachable!("an absent binary must not be started")
        }
    }

    // @test-id: tst_desktop_runtime_002
    // @scenario: scn_desktop_launch_001
    // @invariant: INV-DTR-OLLAMA-2 — a failed local selection stops before
    // PostgreSQL or backend ownership begins.
    // @deterministic: yes; the probe and infrastructure boundary are fakes.
    #[test]
    fn tst_desktop_runtime_002_unavailable_local_ollama_never_starts_infrastructure() {
        let mut probe = UnavailableProbe;
        let mut infrastructure_started = false;
        let result = start_with_probe(
            ModelSelection::Local {
                model: "llama3.2".to_string(),
                action: OllamaAction::Prompt,
                setup_prompted: false,
            },
            Some(&mut probe),
            |_base_url, _handle| {
                infrastructure_started = true;
                unreachable!("unavailable local Ollama must return before PostgreSQL/backend start")
            },
        );
        assert!(result.is_err());
        assert!(!infrastructure_started);
    }
}
