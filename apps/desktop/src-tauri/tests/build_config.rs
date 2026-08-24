//! The build hooks in `tauri.conf.json`, checked against the filesystem.
//!
//! These are shell strings inside a JSON file: nothing compiles them, nothing
//! type-checks them, and a wrong path fails only when someone runs a full
//! `cargo tauri build` — which no CI job here does. That is exactly how the
//! hooks came to reference `../../scripts/build-backend.sh`, which resolves one
//! level above the repository root and had therefore never once run.

use std::path::{Path, PathBuf};

/// Tauri runs the hooks from the app directory — the PARENT of `src-tauri`,
/// not the crate root and not the repo root. Every relative path in them is
/// resolved from here, so the test must resolve them from here too.
fn desktop_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .canonicalize()
        .expect("desktop/ must exist")
}

fn config() -> serde_json::Value {
    let raw = std::fs::read_to_string(desktop_dir().join("src-tauri/tauri.conf.json"))
        .expect("tauri.conf.json");
    serde_json::from_str(&raw).expect("valid JSON")
}

// @test-id: tst_desktop_devcmd_001
// @invariant: INV-DTR-24
// @covers: tauri.conf.json build hooks
// @deterministic: yes
#[test]
fn tst_desktop_devcmd_001_every_script_the_hooks_invoke_exists() {
    let conf = config();
    let base = desktop_dir();
    let mut checked = 0;
    for key in ["beforeDevCommand", "beforeBuildCommand"] {
        let cmd = conf["build"][key]
            .as_str()
            .unwrap_or_else(|| panic!("{key} must be a string"));
        // `bash <path>` — the token right after `bash` is the script.
        let tokens: Vec<&str> = cmd.split_whitespace().collect();
        for (i, tok) in tokens.iter().enumerate() {
            if *tok != "bash" {
                continue;
            }
            let script = tokens
                .get(i + 1)
                .unwrap_or_else(|| panic!("{key}: `bash` with no script"));
            let resolved = base.join(script);
            assert!(
                resolved.is_file(),
                "{key} runs `bash {script}`, which does not exist. Tauri resolves it \
                 from {}, giving {}",
                base.display(),
                resolved.display()
            );
            checked += 1;
        }
    }
    assert!(checked >= 3, "expected the hooks' scripts, found {checked}");
}

// @test-id: tst_desktop_serverbuild_001
// @invariant: INV-DTR-25
// @covers: tauri.conf.json externalBin vs the hooks' staging directory
// @deterministic: yes
#[test]
fn tst_desktop_serverbuild_001_the_backend_is_staged_where_external_bin_looks() {
    let conf = config();

    // `externalBin` entries are relative to the CRATE root; the hook's out-dir
    // argument is relative to `desktop/`. Two different bases for one directory
    // is how a staged binary becomes invisible to the bundler — and that fails
    // at bundling time, long after the compile that would have caught it.
    let external = conf["bundle"]["externalBin"]
        .as_array()
        .expect("externalBin");
    let server = external
        .iter()
        .filter_map(|v| v.as_str())
        .find(|e| e.contains("magnis-server"))
        .expect("the backend sidecar must be declared");
    let expected_dir = Path::new(server).parent().expect("a directory");

    let hook = conf["build"]["beforeBuildCommand"]
        .as_str()
        .expect("beforeBuildCommand");
    let out_dir = hook
        .split_whitespace()
        .skip_while(|t| !t.ends_with("build-backend.sh"))
        .nth(1)
        .expect("build-backend.sh must be given an out-dir");

    // Both made comparable by resolving each from its own base.
    let staged = desktop_dir().join(out_dir);
    let looked_for = desktop_dir().join("src-tauri").join(expected_dir);
    assert_eq!(
        staged,
        looked_for,
        "the hook stages the backend in {}, but externalBin `{server}` makes the \
         bundler look in {}",
        staged.display(),
        looked_for.display()
    );

    // The payload is a separate question from the binary, and the answer a
    // built `.deb` gave is that they do NOT travel together: the sidecar lands
    // in `/usr/bin` and resources land in `/usr/lib/<product>`. So `data/` and
    // `migrations/` ship only if they are declared as resources — externalBin
    // does not carry them — and the shell finds them only under the same
    // subdirectory name it compiles in.
    let resources: Vec<&str> = conf["bundle"]["resources"]
        .as_array()
        .expect("resources must be declared")
        .iter()
        .filter_map(|v| v.as_str())
        .collect();
    let subdir = expected_dir.to_str().expect("utf-8");
    for payload in ["data", "migrations"] {
        let prefix = format!("{subdir}/{payload}");
        assert!(
            resources.iter().any(|r| r.starts_with(&prefix)),
            "`{prefix}` is not a bundle resource, so a packaged app ships without \
             it — externalBin carries binaries only. Declared: {resources:?}"
        );
    }
}
