//! Headless public-runtime launcher. It consumes the same verified staged
//! payload and orchestration library as the Tauri adapter.

use anyhow::{Context, Result};
use magnis_desktop::logging;
use magnis_desktop::ollama::OllamaAction;
use magnis_desktop::paths::AppPaths;
use magnis_desktop::runtime::{self, ModelSelection};
use std::io::Write;
use std::path::PathBuf;
use std::sync::mpsc;

#[derive(Debug)]
struct HeadlessArgs {
    runtime_root: PathBuf,
    server_path: Option<PathBuf>,
    data_root: Option<PathBuf>,
    local_ollama_model: Option<String>,
    ollama_action: OllamaAction,
    backend_port: Option<String>,
    dry_run: bool,
}

fn usage() -> &'static str {
    "usage: magnis-runtime --runtime-root <absolute-path> [--server-path <absolute-path>] [--data-root <absolute-path>] \\
     [--backend-port <port>] [--local-ollama-model <model> \\
     --ollama-action prompt|start|decline|install] [--dry-run]"
}

fn absolute(value: String, flag: &str) -> Result<PathBuf> {
    let path = PathBuf::from(&value);
    if !path.is_absolute() {
        anyhow::bail!("{flag}={value:?} must be an absolute path");
    }
    Ok(path)
}

fn parse_action(value: String) -> Result<OllamaAction> {
    match value.as_str() {
        "prompt" => Ok(OllamaAction::Prompt),
        "start" => Ok(OllamaAction::StartInstalled),
        "decline" => Ok(OllamaAction::Decline),
        "install" => Ok(OllamaAction::OpenInstall),
        _ => anyhow::bail!("--ollama-action must be prompt, start, decline, or install"),
    }
}

fn next_value(args: &mut impl Iterator<Item = String>, flag: &str) -> Result<String> {
    args.next()
        .with_context(|| format!("{flag} requires a value; {}", usage()))
}

fn parse_args(args: impl IntoIterator<Item = String>) -> Result<HeadlessArgs> {
    let mut args = args.into_iter();
    let _program = args.next();
    let mut runtime_root = None;
    let mut server_path = None;
    let mut data_root = None;
    let mut local_ollama_model = None;
    let mut ollama_action = OllamaAction::Prompt;
    let mut backend_port = None;
    let mut dry_run = false;

    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--runtime-root" => {
                runtime_root = Some(absolute(next_value(&mut args, &flag)?, &flag)?)
            }
            "--server-path" => server_path = Some(absolute(next_value(&mut args, &flag)?, &flag)?),
            "--data-root" => data_root = Some(absolute(next_value(&mut args, &flag)?, &flag)?),
            "--backend-port" => backend_port = Some(next_value(&mut args, &flag)?),
            "--local-ollama-model" => local_ollama_model = Some(next_value(&mut args, &flag)?),
            "--ollama-action" => ollama_action = parse_action(next_value(&mut args, &flag)?)?,
            "--dry-run" => dry_run = true,
            "--help" | "-h" => {
                writeln!(std::io::stdout(), "{}", usage()).context("write usage")?;
                std::process::exit(0);
            }
            _ => anyhow::bail!("unknown argument {flag:?}; {}", usage()),
        }
    }

    if local_ollama_model.is_none() && ollama_action != OllamaAction::Prompt {
        anyhow::bail!("--ollama-action requires --local-ollama-model");
    }
    Ok(HeadlessArgs {
        runtime_root: runtime_root.context(usage())?,
        server_path,
        data_root,
        local_ollama_model,
        ollama_action,
        backend_port,
        dry_run,
    })
}

fn main() -> Result<()> {
    let args = parse_args(std::env::args())?;
    if let Some(data_root) = args.data_root.as_ref() {
        // AppPaths treats these two values as its single explicit root. They
        // are set before path initialization, not as a runtime fallback.
        std::env::set_var("MAGNIS_HOME", data_root);
        std::env::set_var("DB_PATH", data_root);
    }
    if let Some(server_path) = args.server_path.as_ref() {
        std::env::set_var("MAGNIS_SERVER_PATH", server_path);
    }
    if let Some(port) = args.backend_port.as_ref() {
        std::env::set_var("MAGNIS_BACKEND_PORT", port);
    }

    let model_selection = match args.local_ollama_model {
        Some(model) => ModelSelection::Local {
            model,
            action: args.ollama_action,
            setup_prompted: false,
        },
        None => ModelSelection::Hosted,
    };

    if args.dry_run {
        writeln!(
            std::io::stdout(),
            "magnis-runtime dry-run: runtime_root={} server_path={} data_root={} host=127.0.0.1 model_selection={model_selection:?}",
            args.runtime_root.display(),
            args.server_path
                .as_ref()
                .map_or_else(|| "<bundled-sidecar>".to_string(), |path| path.display().to_string()),
            args.data_root
                .as_ref()
                .map_or_else(|| "<MAGNIS_HOME>".to_string(), |path| path.display().to_string()),
        )
        .context("write dry-run plan")?;
        return Ok(());
    }

    let app_paths = AppPaths::init()?;
    logging::init_logging(app_paths.logs_dir())?;
    tracing::info!(
        target: "shell",
        data_root = %app_paths.data_root().display(),
        runtime_root = %args.runtime_root.display(),
        "starting headless Magnis runtime"
    );
    let mut runtime = runtime::start(&app_paths, &args.runtime_root, model_selection)?;
    tracing::info!(target: "shell", url = %runtime.base_url(), "headless backend ready");

    let (shutdown_tx, shutdown_rx) = mpsc::channel();
    ctrlc::set_handler(move || {
        let _ = shutdown_tx.send(());
    })
    .context("register headless shutdown handler")?;
    shutdown_rx
        .recv()
        .context("wait for headless shutdown signal")?;
    runtime.stop();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{parse_args, OllamaAction};

    // @test-id: tst_desktop_headless_001
    // @scenario: scn_desktop_launch_001
    // @invariant: INV-DTR-HEADLESS-1 — headless launch has an exact runtime
    // root and never guesses a local model action.
    // @deterministic: yes
    #[test]
    fn tst_desktop_headless_001_requires_exact_runtime_and_explicit_local_action() {
        let plain = parse_args(vec![
            "magnis-runtime".to_string(),
            "--runtime-root".to_string(),
            "/opt/magnis/runtime".to_string(),
            "--server-path".to_string(),
            "/opt/magnis/bin/magnis-server".to_string(),
            "--dry-run".to_string(),
        ])
        .expect("hosted launch is explicit by omission of a local model");
        assert!(plain.local_ollama_model.is_none());
        assert_eq!(
            plain.server_path,
            Some(std::path::PathBuf::from("/opt/magnis/bin/magnis-server"))
        );

        let local = parse_args(vec![
            "magnis-runtime".to_string(),
            "--runtime-root".to_string(),
            "/opt/magnis/runtime".to_string(),
            "--local-ollama-model".to_string(),
            "llama3.2".to_string(),
            "--ollama-action".to_string(),
            "start".to_string(),
        ])
        .expect("a local selection records its action");
        assert_eq!(local.ollama_action, OllamaAction::StartInstalled);

        assert!(parse_args(vec![
            "magnis-runtime".to_string(),
            "--runtime-root".to_string(),
            "relative".to_string(),
        ])
        .is_err());
    }
}
