# Desktop build prerequisites

The Magnis desktop package is built from public shell source plus one exact
runtime artifact; a private backend or frontend checkout is neither required
nor accepted. Use `build/download-runtime.ts` with a chosen release version,
target and SHA-256, then set `MAGNIS_RUNTIME_ARCHIVE`, `MAGNIS_RUNTIME_REF` and
`MAGNIS_RUNTIME_TARGET` as described in [README.md](README.md) before running
Tauri. The command fails for a missing, changed or mismatched release — it does
not fall back to a cache or `latest`.

Install Rust, Bun and the Tauri system prerequisites for the target platform.
For Linux, follow the [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
for WebKitGTK, OpenSSL, appindicator and SVG support. On macOS install Xcode
Command Line Tools.

Before an offline Cargo build, run `build/bundle-embedded-pg.sh` to preseed the
exact PostgreSQL archive named by the public root `.cargo/config.toml`. The
archive version is pinned; a build must fail if it cannot obtain that exact
payload rather than silently choosing another PostgreSQL release.

After the exact runtime has been downloaded and staged, the package contains
the backend executable, compiled UI, data and migrations. Starting it needs no
runtime artifact network access. Keep the matching archive and `.ref.json` if
you need to rebuild offline; staging verifies both again before it replaces
`src-tauri/binaries/`.
