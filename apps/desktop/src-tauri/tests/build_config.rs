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
        // The hook invokes only public staging/preseed scripts. Tauri resolves
        // both forms from the desktop app directory.
        let tokens: Vec<&str> = cmd.split_whitespace().collect();
        for (i, tok) in tokens.iter().enumerate() {
            if *tok != "bash" && *tok != "bun" {
                continue;
            }
            let script = tokens
                .get(i + 1)
                .unwrap_or_else(|| panic!("{key}: `{tok}` with no script"));
            let resolved = base.join(script);
            assert!(
                resolved.is_file(),
                "{key} runs `{tok} {script}`, which does not exist. Tauri resolves it \
                 from {}, giving {}",
                base.display(),
                resolved.display()
            );
            checked += 1;
        }
    }
    assert_eq!(
        checked, 3,
        "expected the two staging calls and PostgreSQL preseed, found {checked}"
    );
}

// @test-id: tst_desktop_serverbuild_001
// @invariant: INV-DTR-25
// @covers: tauri.conf.json externalBin vs the hooks' staging directory
// @deterministic: yes
#[test]
fn tst_desktop_serverbuild_001_the_backend_is_staged_where_external_bin_looks() {
    let conf = config();

    // `externalBin` entries are relative to the crate root. The artifact
    // stager extracts its server at this exact location before Tauri reads the
    // config; no private source build is allowed to fill it.
    let external = conf["bundle"]["externalBin"]
        .as_array()
        .expect("externalBin");
    let server = external
        .iter()
        .filter_map(|v| v.as_str())
        .find(|e| *e == "binaries/bin/magnis-server")
        .expect("the backend sidecar must be declared");
    assert_eq!(server, "binaries/bin/magnis-server");

    let hook = conf["build"]["beforeBuildCommand"]
        .as_str()
        .expect("beforeBuildCommand");
    assert!(hook.contains("bun build/stage-runtime.ts"));
    assert!(!hook.contains("build-backend.sh") && !hook.contains("../frontend"));

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
    for payload in ["data", "migrations", "web"] {
        let prefix = format!("binaries/runtime/{payload}");
        assert!(
            resources.iter().any(|r| r.starts_with(&prefix)),
            "`{prefix}` is not a bundle resource, so a packaged app ships without \
             it — externalBin carries binaries only. Declared: {resources:?}"
        );
    }

    let process_source =
        std::fs::read_to_string(desktop_dir().join("src-tauri/src/backend_process.rs"))
            .expect("backend process source");
    assert!(
        process_source.contains("pub const PAYLOAD_SUBDIR: &str = \"binaries/runtime\""),
        "the backend must receive the extracted runtime root, not the sidecar directory"
    );
}

// @test-id: tst_desktop_runtime_001
// @invariant: INV-DTR-26
// @covers: public runtime-artifact staging → Tauri package inputs
// @deterministic: yes
#[test]
fn tst_desktop_runtime_001_public_artifact_stage_replaces_private_source_builds() {
    let conf = config();
    let build = &conf["build"];

    for key in ["beforeDevCommand", "beforeBuildCommand"] {
        let hook = build[key]
            .as_str()
            .unwrap_or_else(|| panic!("{key} must be a string"));
        assert!(
            hook.contains("bun build/stage-runtime.ts"),
            "{key} must stage the exact public runtime artifact: {hook}"
        );
        assert!(
            !hook.contains("build-backend.sh") && !hook.contains("../frontend"),
            "{key} must not rebuild closed private sources: {hook}"
        );
    }

    assert!(
        desktop_dir().join("build/stage-runtime.ts").is_file(),
        "the public artifact staging entrypoint must exist"
    );
    assert_eq!(
        build["frontendDist"].as_str(),
        Some("binaries/runtime/web"),
        "the webview must use the web output from the same runtime artifact"
    );

    let external = conf["bundle"]["externalBin"]
        .as_array()
        .expect("externalBin");
    assert!(
        external
            .iter()
            .any(|entry| entry.as_str() == Some("binaries/bin/magnis-server")),
        "the runtime artifact's server executable must be the only Tauri sidecar"
    );

    let resources: Vec<&str> = conf["bundle"]["resources"]
        .as_array()
        .expect("resources")
        .iter()
        .filter_map(|entry| entry.as_str())
        .collect();
    for path in [
        "binaries/runtime/data/**/*",
        "binaries/runtime/migrations/**/*",
        "binaries/runtime/web/**/*",
    ] {
        assert!(
            resources.contains(&path),
            "the runtime resource `{path}` is missing: {resources:?}"
        );
    }
}
