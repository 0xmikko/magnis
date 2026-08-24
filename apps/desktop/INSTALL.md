# Desktop build prerequisites

The Magnis desktop package is built from public shell source plus one exact
runtime artifact; a private backend or frontend checkout is neither required
nor accepted. Select `MAGNIS_RUNTIME_ARCHIVE`, `MAGNIS_RUNTIME_REF` and
`MAGNIS_RUNTIME_TARGET` as described in [README.md](README.md) before running
Tauri.

Install Rust, Bun and the Tauri system prerequisites for the target platform.
For Linux, follow the [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
for WebKitGTK, OpenSSL, appindicator and SVG support. On macOS install Xcode
Command Line Tools.

Before an offline Cargo build, run `build/bundle-embedded-pg.sh` to preseed the
exact PostgreSQL archive named by the public root `.cargo/config.toml`. The
archive version is pinned; a build must fail if it cannot obtain that exact
payload rather than silently choosing another PostgreSQL release.
