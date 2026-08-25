//! Optional, user-authorized local Ollama integration.
//!
//! Ollama is not a desktop payload. The shell touches it only after a caller
//! has explicitly selected a local model: it adopts an already-ready loopback
//! daemon, or the caller chooses one install/start action. A daemon we did not
//! start never enters our process tree and is never stopped by us.

use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::Duration;

/// The fixed local daemon root. This is deliberately not configurable: an
/// "Ollama" provider selected by the desktop means the local loopback daemon,
/// not a network endpoint silently supplied by an inherited environment.
pub const OLLAMA_DAEMON_URL: &str = "http://127.0.0.1:11434";
/// The OpenAI-compatible endpoint returned to Magnis' existing provider
/// control plane once the daemon has been verified.
pub const OLLAMA_PROVIDER_URL: &str = "http://127.0.0.1:11434/v1";
pub const OLLAMA_INSTALL_URL: &str = "https://ollama.com/download";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OllamaAvailability {
    Ready {
        base_url: String,
        models: Vec<String>,
        owned_by_shell: bool,
        selected_model: String,
    },
    NotRunning {
        base_url: String,
        can_start: bool,
    },
    NotInstalled {
        install_url: String,
    },
}

impl OllamaAvailability {
    pub fn owned_by_shell(&self) -> bool {
        matches!(
            self,
            Self::Ready {
                owned_by_shell: true,
                ..
            }
        )
    }
}

/// The only operations the decision layer needs. The real implementation is
/// deliberately small; tests provide a deterministic in-memory daemon.
pub trait OllamaProbe {
    /// `Some(models)` means `/api/tags` answered successfully. `None` means
    /// no local daemon was reachable within the bounded request timeout.
    fn tags(&mut self) -> Result<Option<Vec<String>>>;
    /// The installed command, if the user has one on their PATH.
    fn installed_binary(&mut self) -> Result<Option<PathBuf>>;
    /// Starts `ollama serve` only after explicit user authorization.
    fn start(&mut self, binary: &Path) -> Result<OllamaHandle>;
}

/// A process handle distinguishes adopted daemons from the sole child this
/// shell is allowed to terminate during reverse shutdown.
#[derive(Debug)]
pub struct OllamaHandle {
    child: Option<Child>,
    owned_by_shell: bool,
}

impl OllamaHandle {
    fn external() -> Self {
        Self {
            child: None,
            owned_by_shell: false,
        }
    }

    fn owned(child: Child) -> Self {
        Self {
            child: Some(child),
            owned_by_shell: true,
        }
    }

    /// Returns whether this shell owned a child to stop. `Child::kill` is
    /// intentionally never called for an adopted daemon.
    pub fn stop(&mut self) -> bool {
        if !self.owned_by_shell {
            return false;
        }
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        true
    }

    #[cfg(test)]
    fn owned_for_test() -> Self {
        Self {
            child: None,
            owned_by_shell: true,
        }
    }
}

impl Drop for OllamaHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OllamaAction {
    /// Inspect availability only. The UI renders its one setup prompt from the
    /// returned unavailable state.
    Prompt,
    /// The user chose not to set local Ollama up. This is terminal for the
    /// selected local model; it is never translated to a hosted selection.
    Decline,
    /// The user chose to open the official install location.
    OpenInstall,
    /// The user chose to start the discovered installed command.
    StartInstalled,
}

impl OllamaAction {
    /// The frozen wire vocabulary shared by Tauri IPC and the headless CLI.
    pub const WIRE_VALUES: &str = "prompt|start|decline|install";

    pub fn from_wire(value: &str) -> Option<Self> {
        match value {
            "prompt" => Some(Self::Prompt),
            "decline" => Some(Self::Decline),
            "start" => Some(Self::StartInstalled),
            "install" => Some(Self::OpenInstall),
            _ => None,
        }
    }
}

/// Result of a launch-time or UI-time local-model request. Hosted is a
/// separate declared selection, not a recovery state for a failed local one.
#[derive(Debug)]
pub struct OllamaLaunch {
    hosted: bool,
    availability: Option<OllamaAvailability>,
    handle: Option<OllamaHandle>,
    declined: bool,
}

impl OllamaLaunch {
    pub fn is_hosted(&self) -> bool {
        self.hosted
    }

    pub fn availability(&self) -> &OllamaAvailability {
        self.availability
            .as_ref()
            .expect("only a local Ollama launch has availability")
    }

    pub fn requires_explicit_setup(&self) -> bool {
        !self.declined
            && matches!(
                self.availability,
                Some(
                    OllamaAvailability::NotRunning { .. } | OllamaAvailability::NotInstalled { .. }
                )
            )
    }

    pub fn was_declined(&self) -> bool {
        self.declined
    }

    /// The caller persists this against `DesktopPrefs` after a user decision,
    /// rather than marking the prompt consumed merely because discovery ran.
    pub fn records_setup_decision(&self) -> bool {
        self.declined || self.handle.is_some() || !self.requires_explicit_setup()
    }

    pub fn stop(&mut self) -> bool {
        self.handle.as_mut().is_some_and(OllamaHandle::stop)
    }

    pub fn take_handle(&mut self) -> Option<OllamaHandle> {
        self.handle.take()
    }
}

/// A hosted selection has no local probe, subprocess or ambient endpoint.
pub fn hosted_launch() -> OllamaLaunch {
    OllamaLaunch {
        hosted: true,
        availability: None,
        handle: None,
        declined: false,
    }
}

/// Resolve one *already selected* local model. This function has no hosted
/// fallback branch: callers get a local setup result or an error.
pub fn discover_selected_local(
    probe: &mut (impl OllamaProbe + ?Sized),
    selected_model: &str,
    setup_prompted: bool,
    action: OllamaAction,
) -> Result<OllamaLaunch> {
    if selected_model.trim().is_empty() {
        anyhow::bail!("a local Ollama selection requires a model name");
    }

    if let Some(models) = probe.tags()? {
        return ready_launch(models, selected_model, OllamaHandle::external());
    }

    let binary = probe.installed_binary()?;
    let unavailable = match binary.as_ref() {
        Some(_) => OllamaAvailability::NotRunning {
            base_url: OLLAMA_PROVIDER_URL.to_string(),
            can_start: true,
        },
        None => OllamaAvailability::NotInstalled {
            install_url: OLLAMA_INSTALL_URL.to_string(),
        },
    };

    match action {
        OllamaAction::Prompt if setup_prompted => anyhow::bail!(
            "local Ollama is unavailable and its one-time setup prompt was already dismissed"
        ),
        OllamaAction::Prompt => Ok(unavailable_launch(unavailable, false)),
        OllamaAction::Decline => Ok(unavailable_launch(unavailable, true)),
        OllamaAction::OpenInstall => match unavailable {
            OllamaAvailability::NotInstalled { .. } => Ok(unavailable_launch(unavailable, false)),
            OllamaAvailability::NotRunning { .. } => anyhow::bail!(
                "Ollama is installed; start the installed command rather than opening an install flow"
            ),
            OllamaAvailability::Ready { .. } => unreachable!("availability was constructed unavailable"),
        },
        OllamaAction::StartInstalled => {
            let binary = binary.context("Ollama is not installed; no command can be started")?;
            let handle = probe.start(&binary)?;
            let models = probe.tags()?.context(
                "Ollama did not become ready after the user-authorized start; local model remains unavailable",
            )?;
            ready_launch(models, selected_model, handle)
        }
    }
}

fn unavailable_launch(availability: OllamaAvailability, declined: bool) -> OllamaLaunch {
    OllamaLaunch {
        hosted: false,
        availability: Some(availability),
        handle: None,
        declined,
    }
}

fn ready_launch(
    models: Vec<String>,
    selected_model: &str,
    handle: OllamaHandle,
) -> Result<OllamaLaunch> {
    if !models.iter().any(|model| model == selected_model) {
        anyhow::bail!(
            "selected local Ollama model {selected_model:?} is not installed; available models: {models:?}"
        );
    }
    Ok(OllamaLaunch {
        hosted: false,
        availability: Some(OllamaAvailability::Ready {
            base_url: OLLAMA_PROVIDER_URL.to_string(),
            models,
            owned_by_shell: handle.owned_by_shell,
            selected_model: selected_model.to_string(),
        }),
        handle: Some(handle),
        declined: false,
    })
}

/// The production bounded loopback probe. It treats a failed connection or a
/// non-success status as unavailable; a successful malformed response is an
/// error, not an invented empty model list.
pub struct SystemOllamaProbe {
    client: reqwest::blocking::Client,
}

impl SystemOllamaProbe {
    pub fn new() -> Result<Self> {
        Ok(Self {
            client: reqwest::blocking::Client::builder()
                .connect_timeout(Duration::from_secs(1))
                .timeout(Duration::from_secs(2))
                .build()
                .context("build bounded local Ollama HTTP client")?,
        })
    }
}

#[derive(Deserialize)]
struct OllamaTags {
    models: Vec<OllamaTag>,
}

#[derive(Deserialize)]
struct OllamaTag {
    name: String,
}

impl OllamaProbe for SystemOllamaProbe {
    fn tags(&mut self) -> Result<Option<Vec<String>>> {
        let response = match self
            .client
            .get(format!("{OLLAMA_DAEMON_URL}/api/tags"))
            .send()
        {
            Ok(response) => response,
            Err(_) => return Ok(None),
        };
        if !response.status().is_success() {
            return Ok(None);
        }
        let tags: OllamaTags = response
            .json()
            .context("decode successful Ollama /api/tags response")?;
        if tags.models.iter().any(|model| model.name.trim().is_empty()) {
            anyhow::bail!("successful Ollama /api/tags response contains an empty model name");
        }
        Ok(Some(
            tags.models.into_iter().map(|model| model.name).collect(),
        ))
    }

    fn installed_binary(&mut self) -> Result<Option<PathBuf>> {
        let file_name = if cfg!(windows) {
            "ollama.exe"
        } else {
            "ollama"
        };
        let Some(paths) = std::env::var_os("PATH") else {
            return Ok(None);
        };
        Ok(std::env::split_paths(&paths)
            .map(|dir| dir.join(file_name))
            .find(|candidate| candidate.is_file()))
    }

    fn start(&mut self, binary: &Path) -> Result<OllamaHandle> {
        let child = Command::new(binary)
            .arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .with_context(|| format!("start user-authorized Ollama at {}", binary.display()))?;
        Ok(OllamaHandle::owned(child))
    }
}

#[cfg(test)]
mod tests {
    use super::{
        discover_selected_local, hosted_launch, OllamaAction, OllamaAvailability, OllamaHandle,
        OllamaProbe, OLLAMA_PROVIDER_URL,
    };
    use anyhow::Result;
    use std::path::{Path, PathBuf};

    #[derive(Default)]
    struct FakeOllama {
        tags: Vec<Option<Vec<String>>>,
        binary: Option<PathBuf>,
        starts: Vec<PathBuf>,
    }

    impl FakeOllama {
        fn next_tags(&mut self) -> Option<Vec<String>> {
            self.tags.remove(0)
        }
    }

    impl OllamaProbe for FakeOllama {
        fn tags(&mut self) -> Result<Option<Vec<String>>> {
            Ok(self.next_tags())
        }

        fn installed_binary(&mut self) -> Result<Option<PathBuf>> {
            Ok(self.binary.clone())
        }

        fn start(&mut self, binary: &Path) -> Result<OllamaHandle> {
            self.starts.push(binary.to_path_buf());
            Ok(OllamaHandle::owned_for_test())
        }
    }

    // @test-id: tst_desktop_ollama_001
    // @scenario: scn_desktop_model_001
    // @invariant: INV-DTR-OLLAMA-1 — Ollama is queried only for a selected
    // local model; unavailable setup is explicit and never becomes hosted.
    // @covers: ollama::{hosted_launch, discover_selected_local, OllamaHandle}
    // @deterministic: yes; the daemon and process launcher are fakes.
    #[test]
    fn tst_desktop_ollama_001_selected_local_model_is_explicit_and_owned_correctly() {
        let hosted_probe = FakeOllama::default();
        assert!(hosted_launch().is_hosted());
        assert!(
            hosted_probe.tags.is_empty(),
            "hosted launch must not probe Ollama"
        );

        let mut ready = FakeOllama {
            tags: vec![Some(vec!["llama3.2".to_string()])],
            ..Default::default()
        };
        let mut external =
            discover_selected_local(&mut ready, "llama3.2", false, OllamaAction::Prompt)
                .expect("a ready external daemon is adopted");
        assert_eq!(
            external.availability(),
            &OllamaAvailability::Ready {
                base_url: OLLAMA_PROVIDER_URL.to_string(),
                models: vec!["llama3.2".to_string()],
                owned_by_shell: false,
                selected_model: "llama3.2".to_string(),
            }
        );
        assert!(!external.stop(), "a pre-existing daemon is never stopped");

        let installed = PathBuf::from("/opt/ollama/bin/ollama");
        let mut unavailable = FakeOllama {
            tags: vec![None],
            binary: Some(installed.clone()),
            ..Default::default()
        };
        let prompt =
            discover_selected_local(&mut unavailable, "llama3.2", false, OllamaAction::Prompt)
                .expect("unavailable Ollama is a setup prompt, not hosted fallback");
        assert_eq!(
            prompt.availability(),
            &OllamaAvailability::NotRunning {
                base_url: OLLAMA_PROVIDER_URL.to_string(),
                can_start: true,
            }
        );
        assert!(prompt.requires_explicit_setup());
        assert!(unavailable.starts.is_empty());

        let mut declined = FakeOllama {
            tags: vec![None],
            binary: Some(installed.clone()),
            ..Default::default()
        };
        let declined =
            discover_selected_local(&mut declined, "llama3.2", false, OllamaAction::Decline)
                .expect("declining is a terminal local result");
        assert!(declined.was_declined());
        assert!(!declined.is_hosted());

        let mut start_and_ready = FakeOllama {
            tags: vec![None, Some(vec!["llama3.2".to_string()])],
            binary: Some(installed.clone()),
            ..Default::default()
        };
        let mut owned = discover_selected_local(
            &mut start_and_ready,
            "llama3.2",
            false,
            OllamaAction::StartInstalled,
        )
        .expect("an explicitly started daemon must be checked again");
        assert_eq!(start_and_ready.starts, vec![installed]);
        assert!(owned.availability().owned_by_shell());
        assert!(owned.stop(), "the shell stops only its own daemon");

        let mut failed_start = FakeOllama {
            tags: vec![None, None],
            binary: Some(PathBuf::from("/opt/ollama/bin/ollama")),
            ..Default::default()
        };
        assert!(
            discover_selected_local(
                &mut failed_start,
                "llama3.2",
                false,
                OllamaAction::StartInstalled,
            )
            .is_err(),
            "failed setup must remain a local error, never a hosted fallback"
        );

        let mut already_prompted = FakeOllama {
            tags: vec![None],
            binary: None,
            ..Default::default()
        };
        assert!(
            discover_selected_local(
                &mut already_prompted,
                "llama3.2",
                true,
                OllamaAction::Prompt,
            )
            .is_err(),
            "the setup prompt is persisted and shown once"
        );
    }

    // @test-id: tst_desktop_ollama_002
    // @scenario: scn_desktop_model_001
    // @invariant: INV-DTR-OLLAMA-1
    // @covers: discover_selected_local unavailable and selected-model edges
    // @deterministic: yes; the daemon and process launcher are fakes.
    #[test]
    fn tst_desktop_ollama_002_refuses_every_unavailable_or_mismatched_local_selection() {
        let mut missing = FakeOllama {
            tags: vec![None],
            ..Default::default()
        };
        let install =
            discover_selected_local(&mut missing, "llama3.2", false, OllamaAction::OpenInstall)
                .expect(
                    "the install action reports the official install path for an absent binary",
                );
        assert!(matches!(
            install.availability(),
            OllamaAvailability::NotInstalled { .. }
        ));

        let mut wrong_model = FakeOllama {
            tags: vec![Some(vec!["llama3.1".to_string()])],
            ..Default::default()
        };
        assert!(
            discover_selected_local(&mut wrong_model, "llama3.2", true, OllamaAction::Prompt)
                .is_err(),
            "a ready daemon without the selected model is still a local error"
        );

        let mut ready_after_prompt = FakeOllama {
            tags: vec![Some(vec!["llama3.2".to_string()])],
            ..Default::default()
        };
        assert!(matches!(
            discover_selected_local(
                &mut ready_after_prompt,
                "llama3.2",
                true,
                OllamaAction::Prompt,
            )
            .expect("a daemon that becomes ready is not suppressed by a past setup prompt")
            .availability(),
            OllamaAvailability::Ready { .. }
        ));
        assert_eq!(OllamaAction::WIRE_VALUES, "prompt|start|decline|install");
        assert_eq!(
            OllamaAction::from_wire("start"),
            Some(OllamaAction::StartInstalled)
        );
        assert_eq!(OllamaAction::from_wire("hosted-fallback"), None);
    }
}
