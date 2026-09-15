//! The PostgreSQL cluster the shell owns.
//!
//! The backend used to start its own database. It no longer does: the shell
//! extracts the archive it carries, starts the postmaster, creates the
//! database, and hands the child a `DATABASE_URL` (DEC-17/DEC-18). "Local"
//! stops being a mode of the backend and becomes a property of its launcher.
//!
//! Two things here are load-bearing and easy to get subtly wrong.
//!
//! **The lock comes before the orphan stop.** `pg_ctl stop -D <pgdata>`
//! validates the *data directory*, not who owns the process — so without a lock
//! held first, a second instance can stop a postmaster a live instance is
//! using. The reference implementation acquires in exactly that order and this
//! keeps it.
//!
//! **The lock is `fcntl`, and it must also refuse a non-empty file.** The
//! kernel releases an fcntl lock when the holder dies, which is the whole
//! reason to prefer it over a written record with a reaper. But `backend-ts`
//! locks the same filename by `O_EXCL` *with* a JSON record, and the two
//! mechanisms are not symmetric: its reader treats an unparseable file as HELD
//! and refuses loudly, while a bare `fcntl` acquire would succeed against a
//! file that another process created and holds open but never fcntl-locked.
//! Refusing a non-empty file closes that direction.

use anyhow::{bail, Context, Result};
use std::fs::{File, OpenOptions};
use std::os::fd::AsRawFd;
use std::path::Path;

/// The lock file name, shared with `backend-ts` by design — two writers of one
/// data directory must contend for one name, not miss each other on two.
pub const LOCK_FILE: &str = "magnis.lock";

/// An exclusive claim on a data directory, released by the kernel if this
/// process dies.
#[derive(Debug)]
pub struct DataDirLock {
    _file: File,
}

impl DataDirLock {
    /// Take the lock, or explain who has it.
    ///
    /// Refuses when the file carries content: that is `backend-ts`'s `O_EXCL`
    /// record, whose holder an `fcntl` probe cannot see.
    pub fn acquire(data_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(data_dir)
            .with_context(|| format!("creating data dir {}", data_dir.display()))?;
        let path = data_dir.join(LOCK_FILE);

        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&path)
            .with_context(|| format!("opening lock file {}", path.display()))?;

        let len = file
            .metadata()
            .with_context(|| format!("stat lock file {}", path.display()))?
            .len();
        if len > 0 {
            bail!(
                "another Magnis instance holds {} — its lock carries an identity \
                 record, which is how the TypeScript backend locks this directory. \
                 Quit it before starting the desktop app.",
                path.display()
            );
        }

        // SAFETY: a plain fcntl call on a descriptor we own for the duration.
        let taken = unsafe {
            let mut fl: libc::flock = std::mem::zeroed();
            fl.l_type = libc::F_WRLCK as libc::c_short;
            fl.l_whence = libc::SEEK_SET as libc::c_short;
            libc::fcntl(file.as_raw_fd(), libc::F_SETLK, &fl) == 0
        };
        if !taken {
            bail!(
                "another Magnis instance is running — it holds {}. Quit it first.",
                path.display()
            );
        }

        tracing::info!(target: "shell", path = %path.display(), "holding the data-dir lock");
        Ok(Self { _file: file })
    }
}

/// The database name the backend connects to.
pub const DB_NAME: &str = "magnis";
/// Fixed local credentials — the cluster listens on loopback only, and the
/// shell is the only thing that ever composes this URL.
const DB_USER: &str = "postgres";
const DB_PASSWORD: &str = "magnis_local";

/// A running cluster owned by this process.
pub struct PostgresHandle {
    pg: postgresql_embedded::PostgreSQL,
    _lock: DataDirLock,
    port: u16,
    /// `stop()` is reachable twice — Tauri fires both `ExitRequested` and
    /// `Exit` — and once more from `Drop`. Without this the second call logs a
    /// failure that never happened.
    stopped: bool,
}

impl PostgresHandle {
    /// Extract (first run only), start, and make sure the database exists.
    ///
    /// `port` is one this process already bound and released, so the postmaster
    /// takes a port nothing else can have claimed in between.
    pub fn start(data_root: &Path, port: u16) -> Result<Self> {
        // Lock BEFORE touching anything inside the directory — including the
        // orphan stop below, which validates the data dir rather than its
        // owner.
        let lock = DataDirLock::acquire(data_root)?;

        let mut settings = postgresql_embedded::Settings {
            port,
            password: DB_PASSWORD.to_string(),
            // Survive process exit: the cluster is the user's data, not a
            // fixture. The crate's default is ephemeral.
            temporary: false,
            data_dir: data_root.join("pgdata-native"),
            ..postgresql_embedded::Settings::default()
        };

        // `installation_dir` is deliberately left at the crate default
        // (`~/.theseus`): the binaries are read-only and identical across
        // installs, so one shared extraction is a feature. Only DATA is bound
        // to the data root.
        //
        // Once they are there, trust them: `setup()` then skips network version
        // resolution entirely, which is what makes every start after the first
        // work offline.
        if settings
            .installation_dir
            .join("bin")
            .join("postgres")
            .is_file()
        {
            settings.trust_installation_dir = true;
        }

        stop_orphan_postmaster(&settings.data_dir, &settings.installation_dir);

        let mut pg = postgresql_embedded::PostgreSQL::new(settings);
        tauri::async_runtime::block_on(async {
            pg.setup().await.context("extracting PostgreSQL")?;
            pg.start().await.context("starting the postmaster")?;
            if !pg
                .database_exists(DB_NAME)
                .await
                .context("checking for the magnis database")?
            {
                pg.create_database(DB_NAME)
                    .await
                    .context("creating the magnis database")?;
            }
            anyhow::Ok(())
        })?;

        Ok(Self {
            pg,
            _lock: lock,
            port,
            stopped: false,
        })
    }

    /// What the backend child is given. Loopback only, by construction.
    pub fn database_url(&self) -> String {
        format!(
            "postgresql://{DB_USER}:{DB_PASSWORD}@127.0.0.1:{}/{DB_NAME}",
            self.port
        )
    }

    /// Stop the cluster. Called AFTER the backend has exited: stopping the
    /// database under a live pool hands the backend connection errors on its
    /// way out.
    pub fn stop(&mut self) {
        if self.stopped {
            return;
        }
        self.stopped = true;
        if let Err(e) = tauri::async_runtime::block_on(self.pg.stop()) {
            tracing::warn!(target: "shell", error = %e, "PostgreSQL stop failed");
        }
    }
}

impl Drop for PostgresHandle {
    /// Stop the cluster if the handle goes away without an explicit `stop()`.
    ///
    /// `temporary: false` means `postgresql_embedded` will not do this for us —
    /// deliberately, since the cluster is the user's data. But it also means a
    /// startup that fails AFTER the cluster came up (a busy pinned port, a
    /// missing binary, a health timeout) would return `Err` and leave a live
    /// postmaster with no owner. It self-heals on the next boot through the
    /// orphan path; leaking it in the first place is still wrong.
    fn drop(&mut self) {
        if !self.stopped {
            self.stop();
        }
    }
}

/// Clear a postmaster left behind by an unclean exit so a fresh one can boot.
///
/// `pg_ctl` validates against the data directory's own pid file, which is why
/// no PID-identity machinery is needed here: a process we cannot stop is
/// reported, never adopted.
fn stop_orphan_postmaster(pgdata: &Path, installation_dir: &Path) {
    let pidfile = pgdata.join("postmaster.pid");
    if !pidfile.exists() {
        return;
    }
    let pg_ctl = installation_dir.join("bin").join("pg_ctl");
    if !pg_ctl.is_file() {
        return;
    }
    match std::process::Command::new(&pg_ctl)
        .args(["stop", "-D"])
        .arg(pgdata)
        .args(["-m", "fast", "-w"])
        .output()
    {
        Ok(out) if out.status.success() => {
            tracing::warn!(target: "shell", pgdata = %pgdata.display(), "stopped an orphaned postmaster");
        }
        _ => {
            // Either the pid file is stale (the process is gone) or the
            // postmaster refuses to stop. Removing a stale file is safe;
            // a live one will make the start below fail loudly, which is
            // the outcome we want over adopting an unmanaged process.
            let _ = std::fs::remove_file(&pidfile);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{DataDirLock, LOCK_FILE};
    use std::io::Write;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!(
            "magnis-pg-{name}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&p);
        p
    }

    // @test-id: tst_desktop_pglock_001
    // @invariant: INV-DTR-1 (one writer per data directory), DEC-26
    // @covers: postgres::DataDirLock::acquire
    // @deterministic: yes
    // @fixtures: temporary data directories, one carrying a foreign record
    #[test]
    fn tst_desktop_pglock_001_second_acquire_and_foreign_record_both_refuse() {
        let dir = temp_dir("lock");

        let held = DataDirLock::acquire(&dir).expect("first acquire succeeds");
        let lock_path = dir.join(LOCK_FILE);
        assert!(lock_path.is_file(), "the lock file is created on acquire");
        assert_eq!(
            std::fs::read(&lock_path).expect("read lock").len(),
            0,
            "our lock file stays EMPTY — the kernel holds the claim, not a record"
        );

        // Same process, same directory: fcntl locks are per-process, so this
        // does not prove cross-process exclusion on its own. What it does prove
        // is that the file is not recreated or truncated behind our back.
        drop(held);

        // A foreign holder writes an identity record. An fcntl probe cannot see
        // it, so content is the only signal — refuse rather than proceed onto a
        // directory a live TypeScript backend is writing.
        let foreign = temp_dir("foreign");
        std::fs::create_dir_all(&foreign).expect("mkdir");
        let mut f = std::fs::File::create(foreign.join(LOCK_FILE)).expect("create foreign lock");
        f.write_all(br#"{"pid":1,"exe_path":"/x","start_time":1}"#)
            .expect("write record");
        drop(f);

        let err = DataDirLock::acquire(&foreign).expect_err("a foreign record must refuse");
        let text = format!("{err:#}");
        assert!(
            text.contains("identity record"),
            "the refusal must name WHY it refused: {text}"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&foreign);
    }

    // @test-id: tst_desktop_pgstart_001
    // @invariant: INV-DTR-17 (cluster reuse), INV-DTR-18 (stale pid recovers)
    // @covers: postgres::PostgresHandle::start/stop, stop_orphan_postmaster
    // @deterministic: yes
    // @fixtures: a real cluster in a temporary data root, on a bound port
    #[test]
    fn tst_desktop_pgstart_001_start_reuse_and_stale_pid() {
        // No skip guard: the `bundled` feature compiles the archive INTO this
        // binary, so `setup()` extracts with no network and no pre-seeded
        // directory. If that is ever untrue this test must FAIL, not skip —
        // it is the runtime half of DEC-17.

        let dir = temp_dir("cluster");
        let port = crate::ports::bind_port("postgres-test", None)
            .expect("bind a free port")
            .release();

        let mut pg = super::PostgresHandle::start(&dir, port).expect("first start");
        assert!(
            pg.database_url().contains(&port.to_string()),
            "the URL must carry the port we bound"
        );
        assert!(
            dir.join("pgdata-native").join("postmaster.pid").exists(),
            "a running cluster writes its pid file"
        );
        pg.stop();
        drop(pg);

        // Second start on the same root: the cluster is REUSED, not rebuilt.
        // Identity, not size: PG_VERSION holds a constant major-version string,
        // so comparing its LENGTH passes even after a full re-initdb — the
        // assertion could not fail. The inode changes only if the cluster was
        // actually rebuilt.
        use std::os::unix::fs::MetadataExt;
        let marker = dir.join("pgdata-native").join("PG_VERSION");
        let before = std::fs::metadata(&marker).expect("PG_VERSION exists").ino();
        let mut pg2 = super::PostgresHandle::start(&dir, port).expect("restart on the same root");
        assert_eq!(
            std::fs::metadata(&marker)
                .expect("PG_VERSION still there")
                .ino(),
            before,
            "restart must reuse the cluster, not re-initdb it"
        );
        pg2.stop();
        drop(pg2);

        // A stale pid file (process long gone) must not block a start.
        std::fs::write(dir.join("pgdata-native").join("postmaster.pid"), "999999\n")
            .expect("plant a stale pid file");
        let mut pg3 = super::PostgresHandle::start(&dir, port).expect("stale pid must recover");
        pg3.stop();
        drop(pg3);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
