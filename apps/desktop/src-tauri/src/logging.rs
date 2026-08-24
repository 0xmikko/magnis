//! The desktop shell's own log (plan backend-logging-system DEC-16).
//!
//! The backend writes its own `backend.<date>.log`; this is the shell's
//! `desktop.<date>.log` in the SAME `logs/` folder — the shell's `tracing`
//! events plus every line the backend child writes to stderr, which is the
//! only place a failure from before the backend's logger existed (a bad env
//! file, exit 64, a crashed spawn) can be read on a Finder-launched app.
//!
//! One folder tells the whole desktop story. Rule 9: no print macros
//! anywhere in this crate — `tracing::` macros only.

use std::io::{BufRead, BufReader, IsTerminal};
use std::path::Path;
use std::process::ChildStderr;
use std::sync::mpsc;
use std::thread::JoinHandle;
use std::time::Duration;

use anyhow::Context;
use tracing::dispatcher::{self, Dispatch};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::filter::LevelFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::{fmt, Layer, Registry};

/// `desktop.<YYYY-MM-DD>.log`, UTC date, beside the backend's `backend.*.log`.
pub const DESKTOP_LOG_PREFIX: &str = "desktop";
pub const DESKTOP_LOG_SUFFIX: &str = "log";
/// Files kept by the appender's own prune (prefix+suffix scoped, so
/// `backend.*.log` is never touched).
pub const DESKTOP_LOG_KEEP: usize = 7;

/// The subscriber: an INFO-filtered file layer (no ANSI) over a daily-rolling
/// appender in `logs_dir`, plus an INFO-filtered stderr layer when asked
/// (`main` asks when it has a terminal — `cargo tauri dev`). Returned rather
/// than installed so tests can `with_default` it per test; `init_logging`
/// installs it once for the process.
pub fn build_subscriber(
    logs_dir: &Path,
    stderr: bool,
) -> anyhow::Result<impl tracing::Subscriber + Send + Sync> {
    // @tested-by: tst_desktop_log_001
    let appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix(DESKTOP_LOG_PREFIX)
        .filename_suffix(DESKTOP_LOG_SUFFIX)
        .max_log_files(DESKTOP_LOG_KEEP)
        .build(logs_dir)
        .with_context(|| format!("open the desktop log in {}", logs_dir.display()))?;
    let file_layer = fmt::layer()
        .with_ansi(false)
        .with_writer(appender)
        .with_filter(LevelFilter::INFO);
    let stderr_layer = stderr.then(|| {
        fmt::layer()
            .with_writer(std::io::stderr)
            .with_filter(LevelFilter::INFO)
    });
    Ok(Registry::default().with(file_layer).with(stderr_layer))
}

/// Install the process logger — `main` only, once, right after `AppPaths`
/// resolved the logs directory.
pub fn init_logging(logs_dir: &Path) -> anyhow::Result<()> {
    let subscriber = build_subscriber(logs_dir, std::io::stderr().is_terminal())?;
    tracing::subscriber::set_global_default(subscriber)
        .context("install the desktop process logger")?;
    Ok(())
}

/// The reader thread that turns the backend child's stderr into `warn`
/// events. It captured the dispatcher current at spawn time and runs under
/// it, so the events land in the same subscriber as the shell's own — for
/// `main` the global one, for a test the `with_default` one.
pub struct StderrForwarder {
    done: mpsc::Receiver<()>,
    handle: Option<JoinHandle<()>>,
}

impl StderrForwarder {
    /// Wait up to `bound` for the pipe's EOF. EOF arrives only when the child
    /// AND every process that inherited its stderr (connectors the backend
    /// spawned) exit, so `stop()` never blocks past this bound; a forwarder
    /// still reading is left detached. Returns whether the reader finished.
    pub fn join_within(&mut self, bound: Duration) -> bool {
        // @tested-by: tst_desktop_log_002
        match self.done.recv_timeout(bound) {
            Ok(()) => {
                if let Some(handle) = self.handle.take() {
                    let _ = handle.join();
                }
                true
            }
            Err(_) => false,
        }
    }
}

/// Start forwarding: one `tracing::warn!(target: "backend.stderr", …)` per
/// line, until the pipe closes.
pub fn forward_child_stderr(stderr: ChildStderr) -> StderrForwarder {
    // @tested-by: tst_desktop_log_002
    // @invariant: every stderr line becomes one warn under backend.stderr, in the spawning dispatcher
    let dispatch: Dispatch = dispatcher::get_default(|current| current.clone());
    let (done_tx, done_rx) = mpsc::channel();
    let handle = std::thread::spawn(move || {
        dispatcher::with_default(&dispatch, || {
            for line in BufReader::new(stderr).lines() {
                match line {
                    Ok(text) => tracing::warn!(target: "backend.stderr", "{}", text),
                    Err(_) => break,
                }
            }
        });
        let _ = done_tx.send(());
    });
    StderrForwarder {
        done: done_rx,
        handle: Some(handle),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::{Command, Stdio};

    /// The forwarder's target — a compile-time literal at the macro, so
    /// spelled once more here for the assertions.
    const BACKEND_STDERR_TARGET: &str = "backend.stderr";

    fn utc_today() -> String {
        // The appender names files by the UTC date; derive it the same way
        // (days since the epoch, civil-from-days) without pulling a date crate.
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock after the epoch")
            .as_secs();
        let days = (secs / 86_400) as i64;
        // Howard Hinnant's civil_from_days.
        let z = days + 719_468;
        let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
        let y = yoe + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = if m <= 2 { y + 1 } else { y };
        format!("{y:04}-{m:02}-{d:02}")
    }

    fn desktop_logs(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .expect("read logs dir")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with("desktop.") && name.ends_with(".log"))
            .collect();
        names.sort();
        names
    }

    fn file_text(dir: &Path, name: &str) -> String {
        fs::read_to_string(dir.join(name)).unwrap_or_default()
    }

    /// @test-id: tst_desktop_log_001
    /// @invariant: INV-LOG-16 — desktop.<date>.log, INFO and above, no ANSI,
    /// at most 7 desktop.*.log kept, other files untouched.
    #[test]
    fn tst_desktop_log_001_daily_file_info_filter_and_prune() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let dir = tmp.path();
        // Nine past-dated seeds (none is today) plus a sibling that must survive.
        for day in 1..=9 {
            fs::write(dir.join(format!("desktop.2020-01-{day:02}.log")), "old\n").expect("seed");
        }
        fs::write(dir.join("backend.x.log"), "keep me\n").expect("sibling");

        let subscriber = build_subscriber(dir, false).expect("subscriber");
        tracing::subscriber::with_default(subscriber, || {
            tracing::info!(target: "shell", "hello from the shell");
            tracing::debug!(target: "shell", "debug must not land");
        });

        let logs = desktop_logs(dir);
        // The appender prunes by file birth time, tick-identical for files
        // created in one loop: assert the COUNT and today's presence, not
        // which six seeds survived.
        assert_eq!(logs.len(), 7, "logs: {logs:?}");
        let today = format!("desktop.{}.log", utc_today());
        assert!(logs.contains(&today), "today's file missing: {logs:?}");
        let text = file_text(dir, &today);
        assert!(
            text.contains("hello from the shell"),
            "info line missing: {text}"
        );
        assert!(
            !text.contains("debug must not land"),
            "debug leaked: {text}"
        );
        assert!(!text.contains('\u{1b}'), "ANSI byte in the file: {text:?}");
        assert!(dir.join("backend.x.log").exists(), "sibling was pruned");
    }

    /// @test-id: tst_desktop_log_002
    /// @invariant: INV-LOG-17 — every stderr line of the child is a warn under
    /// backend.stderr; the child's stdout is not; join_within returns.
    #[test]
    fn tst_desktop_log_002_child_stderr_is_forwarded() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let dir = tmp.path();
        let subscriber = build_subscriber(dir, false).expect("subscriber");
        tracing::subscriber::with_default(subscriber, || {
            let mut child = Command::new("sh")
                .args(["-c", "echo one >&2; echo out; echo two >&2; exit 3"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .spawn()
                .expect("spawn sh");
            let stderr = child.stderr.take().expect("piped stderr");
            let mut forwarder = forward_child_stderr(stderr);
            let status = child.wait().expect("wait");
            assert_eq!(status.code(), Some(3));
            assert!(
                forwarder.join_within(Duration::from_secs(2)),
                "reader did not finish"
            );
        });
        let today = format!("desktop.{}.log", utc_today());
        let text = file_text(dir, &today);
        assert!(
            text.contains(BACKEND_STDERR_TARGET),
            "no backend.stderr target: {text}"
        );
        assert!(
            text.contains("one") && text.contains("two"),
            "stderr lines missing: {text}"
        );
        assert!(!text.contains("out"), "stdout leaked into the log: {text}");
        assert_eq!(text.matches(BACKEND_STDERR_TARGET).count(), 2, "{text}");
        assert!(text.contains("WARN"), "not at warn: {text}");
    }

    /// @test-id: tst_desktop_log_003
    /// @invariant: INV-LOG-16 — no print macro anywhere in this crate's src
    /// (the desktop crate has no eslint; this is its one guard).
    #[test]
    fn tst_desktop_log_003_no_print_macros_in_src() {
        // Built by concatenation so this test's own source does not match.
        let needles = [concat!("print", "ln!"), concat!("eprint", "ln!")];
        let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut hits = Vec::new();
        let mut stack = vec![src.clone()];
        while let Some(dir) = stack.pop() {
            for entry in fs::read_dir(&dir).expect("read src") {
                let entry = entry.expect("entry");
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                } else if path.extension().is_some_and(|ext| ext == "rs") {
                    let text = fs::read_to_string(&path).expect("read rs");
                    if needles.iter().any(|needle| text.contains(needle)) {
                        hits.push(path);
                    }
                }
            }
        }
        assert!(hits.is_empty(), "print macros in: {hits:?}");
    }
}
