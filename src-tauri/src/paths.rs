use std::path::PathBuf;
use anyhow::{Context, Result};

/// Manages application paths (database, logs, plugins directory)
#[derive(Debug, Clone)]
pub struct AppPaths {
    app_data_dir: PathBuf,
    db_path: PathBuf,
    logs_dir: PathBuf,
    plugins_dir: PathBuf,
}

impl AppPaths {
    pub fn init() -> Result<Self> {
        let app_data_dir = dirs::data_dir()
            .context("Failed to get data directory")?
            .join("com.magnis.desktop");

        // Create directories if they don't exist
        std::fs::create_dir_all(&app_data_dir)
            .context("Failed to create app data directory")?;

        let logs_dir = app_data_dir.join("logs");
        std::fs::create_dir_all(&logs_dir)
            .context("Failed to create logs directory")?;

        let plugins_dir = app_data_dir.join("plugins");
        std::fs::create_dir_all(&plugins_dir)
            .context("Failed to create plugins directory")?;

        let db_path = std::env::var("DB_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| app_data_dir.join("magnis.db"));

        Ok(Self {
            app_data_dir,
            db_path,
            logs_dir,
            plugins_dir,
        })
    }

    pub fn app_data_dir(&self) -> &PathBuf {
        &self.app_data_dir
    }

    pub fn db_path(&self) -> &PathBuf {
        &self.db_path
    }

    pub fn logs_dir(&self) -> &PathBuf {
        &self.logs_dir
    }

    pub fn plugins_dir(&self) -> &PathBuf {
        &self.plugins_dir
    }
}
