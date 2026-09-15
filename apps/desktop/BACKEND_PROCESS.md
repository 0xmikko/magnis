# Backend process boundary

The public Tauri shell starts the closed `magnis-server` executable from a
verified runtime artifact. The shell and backend communicate only over a
loopback HTTP address returned to the webview by the existing Tauri IPC command.

```text
Tauri shell
  ├─ embedded PostgreSQL cluster
  └─ magnis-server sidecar
       └─ runtime/{data,migrations,web}
```

The startup order is fixed: select the application data root, start embedded
PostgreSQL, reserve a loopback backend port, then start the sidecar with the
database URL and `MAGNIS_RUNTIME_ROOT`. The runtime root is always the staged
`binaries/runtime` directory, never inferred from an executable's location.
This matters because packaged sidecars and bundle resources are installed in
different directories on Linux.

On quit the shell performs reverse shutdown: it asks the backend to exit,
waits for the bounded graceful shutdown, and then stops PostgreSQL. An explicit
`MAGNIS_SERVER_PATH` remains a developer/test override; a set-but-missing path
is an error and must not fall through to another server binary.

The shell owns process lifecycle and transport only. It does not contain
backend domain logic, private migrations or a second model/cache implementation.
