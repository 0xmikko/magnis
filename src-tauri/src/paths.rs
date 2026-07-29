use anyhow::{Context, Result};
use std::path::PathBuf;

/// Desktop-side paths. Stage 4: switched from a single-file SQLite
/// `db_path` to a `data_root` directory — Local-mode PGlite uses the
/// whole directory (pgdata/, jwt.secret, magnis.lock, magnis.json,
/// pglite.json, storage/). See `docs/deployment/local.md` for layout.
#[derive(Debug, Clone)]
pub struct AppPaths {
    app_data_dir: PathBuf,
    data_root: PathBuf,
    logs_dir: PathBuf,
    // Created on init and retained for future plugin loading; not read yet.
    #[allow(dead_code)]
    plugins_dir: PathBuf,
}

impl AppPaths {
    pub fn init() -> Result<Self> {
        // ONE ROOT. `MAGNIS_HOME` (default `~/.magnis`) is the single home for
        // data, plugins, logs and secrets.
        //
        // Before this there were three independent roots with three different
        // defaults — data under Application Support, sources under a RELATIVE
        // path resolved against the process CWD, modules under whichever of
        // those happened to win. Startup was therefore non-deterministic: the
        // same build found its connectors from a terminal and not from Finder,
        // and a "missing database" was really a different root. Every failure
        // of that day traces back to there being no single answer to "where
        // does this app live".
        //
        // Adoption, not silent divergence: when the home does not exist yet but
        // a legacy Application Support root does, the legacy one is ADOPTED and
        // the choice is printed. Starting empty beside 5 GB of existing data is
        // the one outcome that must never happen quietly.
        let legacy_dir = dirs::data_dir()
            .context("Failed to get data directory")?
            .join("com.magnis.desktop");
        let home = match std::env::var("MAGNIS_HOME") {
            Ok(raw) if !raw.trim().is_empty() => {
                let p = PathBuf::from(&raw);
                if !p.is_absolute() {
                    anyhow::bail!(
                        "MAGNIS_HOME={raw:?} must be an absolute path — desktop \
                         bundles do not guarantee a working directory"
                    );
                }
                p
            }
            _ => {
                let default_home = dirs::home_dir()
                    .context("Failed to get home directory")?
                    .join(".magnis");
                if !default_home.exists() && legacy_dir.exists() {
                    eprintln!(
                        "magnis: adopting the existing data root {} \
                         (MAGNIS_HOME {} does not exist yet)",
                        legacy_dir.display(),
                        default_home.display()
                    );
                    legacy_dir.clone()
                } else {
                    default_home
                }
            }
        };
        eprintln!("magnis: home = {}", home.display());
        let app_data_dir = home;

        std::fs::create_dir_all(&app_data_dir).context("Failed to create app data directory")?;

        let logs_dir = app_data_dir.join("logs");
        std::fs::create_dir_all(&logs_dir).context("Failed to create logs directory")?;

        // Local-mode data root: `app_data_dir` itself. Backend will
        // create `pgdata/`, `storage/`, etc. under it. `DB_PATH` env
        // override kept so operators can redirect (e.g. external
        // drive). If set, it MUST be an absolute directory path —
        // relative paths are resolved against the process CWD, which
        // desktop bundles do not guarantee (plan invariant 8). Reject
        // relative overrides loudly rather than silently resolving
        // against an unknown CWD.
        let data_root = match std::env::var("DB_PATH") {
            Ok(raw) => {
                let p = PathBuf::from(&raw);
                if !p.is_absolute() {
                    anyhow::bail!(
                        "DB_PATH={raw:?} must be an absolute directory path; \
                         desktop bundles do not guarantee CWD, so relative \
                         paths cannot be resolved deterministically"
                    );
                }
                p
            }
            Err(_) => app_data_dir.clone(),
        };
        std::fs::create_dir_all(&data_root).context("Failed to create data root")?;

        // The plugin tree MUST hang off the RESOLVED data root, not
        // `app_data_dir`: the launchd plist points `MAGNIS_PLUGINS_DIR` at
        // `<data_root>/plugins`, and a `DB_PATH` override moves the data root
        // away from `app_data_dir`. Creating it in the wrong place leaves the
        // backend with a non-canonicalizable path → `build_plugin_installer`
        // returns None → `extensions.install` cannot run at all.
        let plugins_dir = ensure_plugin_tree(&data_root)?;

        Ok(Self {
            app_data_dir,
            data_root,
            logs_dir,
            plugins_dir,
        })
    }

    pub fn app_data_dir(&self) -> &PathBuf {
        &self.app_data_dir
    }

    pub fn data_root(&self) -> &PathBuf {
        &self.data_root
    }

    pub fn workspace_config_path(&self) -> PathBuf {
        self.app_data_dir.join("workspaces.json")
    }

    pub fn logs_dir(&self) -> &PathBuf {
        &self.logs_dir
    }

    #[allow(dead_code)]
    pub fn plugins_dir(&self) -> &PathBuf {
        &self.plugins_dir
    }
}

/// Create `<data_root>/plugins` with its `modules/` and `sources/` subdirs and
/// return the root. Pure in its input (no env), so it is directly testable.
///
/// The DMG ships NO plugin payload — packages are installed from the catalog
/// channel into the store — but the directory must still exist: the installer
/// canonicalizes it at construction.
pub fn ensure_plugin_tree(data_root: &std::path::Path) -> Result<PathBuf> {
    let plugins_dir = data_root.join("plugins");
    for sub in ["modules", "sources"] {
        std::fs::create_dir_all(plugins_dir.join(sub))
            .with_context(|| format!("Failed to create plugins/{sub} under {plugins_dir:?}"))?;
    }
    Ok(plugins_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    // @test-id: tst_desktop_paths_010
    // The plugin tree hangs off the data root the plist actually points at.
    #[test]
    fn tst_desktop_paths_010_plugin_tree_under_data_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("custom-data-root");
        std::fs::create_dir_all(&root).unwrap();

        let plugins = ensure_plugin_tree(&root).unwrap();

        assert_eq!(plugins, root.join("plugins"));
        assert!(plugins.join("modules").is_dir(), "modules/ must exist");
        assert!(plugins.join("sources").is_dir(), "sources/ must exist");
        // Canonicalizable — PluginInstaller::new canonicalizes and returns
        // None on failure, which silently disables extensions.install.
        assert!(plugins.canonicalize().is_ok());
    }

    // @test-id: tst_desktop_paths_011
    // Idempotent: a second launch must not fail on an existing tree.
    #[test]
    fn tst_desktop_paths_011_plugin_tree_is_idempotent() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_path_buf();
        let first = ensure_plugin_tree(&root).unwrap();
        let second = ensure_plugin_tree(&root).unwrap();
        assert_eq!(first, second);
        assert!(second.join("modules").is_dir());
    }
}
