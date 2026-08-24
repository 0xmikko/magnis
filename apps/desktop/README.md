# Magnis desktop shell

`apps/desktop` is the public Tauri owner of the local application lifecycle.
It owns embedded PostgreSQL, the data root, loopback ports, the tray, the
single-instance rule and reverse shutdown. It does not build, vendor or inspect
a private Magnis checkout.

The backend executable, migrations, runtime data and compiled web application
arrive as one immutable Magnis runtime archive. The public contract is
[runtime-artifact-contract.md](../../docs/runtime-artifact-contract.md).

## Required runtime input

Every local build or package operation requires all three explicit values:

- `MAGNIS_RUNTIME_ARCHIVE` — absolute path to the selected `.tar.gz` asset;
- `MAGNIS_RUNTIME_REF` — absolute path to its matching `runtime-ref.json`;
- `MAGNIS_RUNTIME_TARGET` — the exact target named by both documents.

The staging command verifies the reference's canonical GitHub Release URL and
checksum, validates the manifest identity and every extracted file digest, then
atomically replaces the ignored `src-tauri/binaries/` build input. A mismatch
leaves an existing staged runtime untouched. There is no `latest`, source-tree,
host-architecture or stale-sidecar fallback.

```bash
cd <public-magnis-checkout>
export MAGNIS_RUNTIME_ARCHIVE=/absolute/path/magnis-runtime-v0.1.0-x86_64-unknown-linux-gnu.tar.gz
export MAGNIS_RUNTIME_REF=/absolute/path/runtime-ref.json
export MAGNIS_RUNTIME_TARGET=x86_64-unknown-linux-gnu
bun apps/desktop/build/stage-runtime.ts
```

The staged artifact has this Tauri input layout:

```text
src-tauri/binaries/
  bin/magnis-server-<target>
  runtime/{data,migrations,web}/
```

## Build and verification

Install the Tauri system prerequisites for the host platform (see the
[Tauri guide](https://v2.tauri.app/start/prerequisites/)). The PostgreSQL
archive is pinned in the root `.cargo/config.toml`; preseed it before an
offline Cargo build with `build/bundle-embedded-pg.sh`.

```bash
cd <public-magnis-checkout>
bash apps/desktop/build/bundle-embedded-pg.sh
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cd apps/desktop/src-tauri
cargo tauri build
```

`Cargo.lock` is tracked. Update it only with an intentional dependency change,
review it with `Cargo.toml`, and use `--locked` in reproducible/CI builds.

## Runtime boundaries

At start the shell starts embedded PostgreSQL, selects a loopback backend port,
then starts the staged `magnis-server` sidecar with the database URL and the
extracted `runtime/` root. The sidecar serves the same compiled web identity
that Tauri packages. On quit the shell stops the backend first, then the
PostgreSQL cluster.

The optional Ollama flow is a later shell capability. FastEmbed remains an
in-process TypeScript library and verified cache of the closed backend; it is
not a desktop process or artifact protocol.
