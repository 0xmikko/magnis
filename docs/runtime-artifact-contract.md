# Desktop runtime artifact contract v1

`@magnis/runtime-contracts` is the public authority for a Magnis desktop
runtime. A desktop build accepts one fully specified artifact reference; it
never resolves `latest`, guesses a platform, or discovers a private checkout.

## Immutable release surface

The private producer publishes only to GitHub Releases in
[`0xmikko/magnis`](https://github.com/0xmikko/magnis). For runtime version
`<version>` and target `<target>`, the immutable coordinates are:

```text
tag:     runtime-v<version>
asset:   magnis-runtime-v<version>-<target>.tar.gz
URL:     https://github.com/0xmikko/magnis/releases/download/runtime-v<version>/magnis-runtime-v<version>-<target>.tar.gz
```

The producer refuses an existing tag or asset. Retrying a publication means a
new runtime version, not replacing an old archive. The private workflow uses
the secret name `MAGNIS_RUNTIME_RELEASE_TOKEN`; it is a narrowly scoped
credential with access only to create release contents in this public
repository. Its value never enters source, logs, an artifact, or a lock file.

## Identity and target vocabulary

Schema version is `1`; runtime protocol is `magnis-runtime/v1`. The artifact
reference contains all of `runtimeVersion`, `protocolVersion`, `target`, URL,
and a lowercase SHA-256 archive digest. The manifest repeats version, protocol
and target, declares every extracted-file digest, and fixes this layout:

```text
manifest.json
bin/magnis-server-<target>
runtime/data/**
runtime/migrations/**
runtime/web/**
```

The only target IDs accepted by the v1 schema are:

- `x86_64-unknown-linux-gnu`
- `aarch64-unknown-linux-gnu`
- `x86_64-apple-darwin`
- `aarch64-apple-darwin`

This is a vocabulary, not a promise that all four packages exist. A target
becomes available only after the private candidate archive and public clean
package receipts succeed, and then it may appear in the versioned runtime
lock. Windows is not an accepted v1 target and must fail rather than fall back
to another artifact.

### Stage 0 candidate receipt — 2026-08-24

The current private producer compiled a candidate backend for every v1 target,
then staged the existing `data`/`migrations` payload and compiled web output
under the v1 layout. Source maps were removed before archiving; the archive
path scan found no `.git`, `node_modules`, TypeScript, source-map or package
metadata path. These are unsigned, unpublished conformance candidates, not
Tauri package receipts and not selections a user can install yet.

| Target | Archive SHA-256 | Bytes |
|---|---|---:|
| `x86_64-unknown-linux-gnu` | `091505e695850c0ded24ba204b136d3f7580e487326f5790a62849cec03e04ce` | 48,276,081 |
| `aarch64-unknown-linux-gnu` | `6df744be3831163b7571a46fb75529220a90b9f3768a2fb11d0d94ae6eed9e02` | 47,357,448 |
| `x86_64-apple-darwin` | `e146c377f162d1195e8304d19b3cca9147cb3b5f7ec5c95b7dcf3fb8862d5d3b` | 34,028,826 |
| `aarch64-apple-darwin` | `4fc13b028fe01169bbe84f677d793991873a23825cbffe02d9197b1f809764ad` | 31,841,820 |

The command adapted the current producer's flat output into the v1 layout
only in a temporary candidate directory. Stage 1 must put that layout,
manifest generation and the same source-leak checks into the tracked private
producer before a release can exist.

## Local AI contract

Ollama is optional and external. It is considered only after a user selects a
local Ollama model; hosted-model launches make no Ollama probe.

- Probe `GET http://127.0.0.1:11434/api/tags` with a bounded two-second
  timeout. A valid `200` response is `ready`; its listed models are reported
  to the existing backend provider/model control plane.
- A connection failure is `not_running` if an `ollama` executable is found on
  the user's `PATH`; Magnis may start `ollama serve` only after explicit user
  consent, then repeats the same probe. That child is shell-owned and is
  stopped during reverse shutdown.
- If no executable is found, the state is `not_installed`. The one-time setup
  prompt can open `https://ollama.com/download`, but never downloads or
  installs anything itself. The answered prompt is persisted under the
  selected data root with key `ollama.setup.v1`.
- A pre-existing ready daemon is never shell-owned and is never stopped.
  Declined or failed setup is an error for the selected local model; it never
  becomes a hosted-provider fallback.

FastEmbed is intentionally absent from this protocol. It remains the closed
backend's in-process TypeScript adapter and its existing digest-verified model
cache is materialized only by the backend's explicit user action.
