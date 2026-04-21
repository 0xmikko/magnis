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
    plugins_dir: PathBuf,
}

impl AppPaths {
    pub fn init() -> Result<Self> {
        let app_data_dir = dirs::data_dir()
            .context("Failed to get data directory")?
            .join("com.magnis.desktop");

        std::fs::create_dir_all(&app_data_dir)
            .context("Failed to create app data directory")?;

        let logs_dir = app_data_dir.join("logs");
        std::fs::create_dir_all(&logs_dir).context("Failed to create logs directory")?;

        let plugins_dir = app_data_dir.join("plugins");
        std::fs::create_dir_all(&plugins_dir).context("Failed to create plugins directory")?;

        // Local-mode data root: `app_data_dir` itself. Backend will
        // create `pgdata/`, `storage/`, etc. under it. `DB_PATH` env
        // override kept so operators can redirect (e.g. external
        // drive). If set, it MUST be an absolute directory path —
        // relative paths are resolved against the process CWD, which
        // desktop bundles do not guarantee (plan invariant 8).
        let data_root = std::env::var("DB_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| app_data_dir.clone());
        std::fs::create_dir_all(&data_root).context("Failed to create data root")?;

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

    pub fn logs_dir(&self) -> &PathBuf {
        &self.logs_dir
    }

    pub fn plugins_dir(&self) -> &PathBuf {
        &self.plugins_dir
    }
}
