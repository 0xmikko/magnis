# Tauri IPC boundary

The desktop shell exposes only lifecycle/transport commands needed before the
closed backend's HTTP API is available:

- `get_backend_config` returns the owned loopback base URL for the webview;
- `get_workspace_seeds` exposes shell-owned connection seed metadata;
- `open_oauth_window` opens the shell-managed OAuth surface.

Magnis entities, links, events, search, migrations and model behavior are not
Tauri IPC commands. They belong to the staged `magnis-server` runtime and are
reached by the web application over the loopback backend URL. Keeping that
boundary prevents the public shell from becoming a duplicate implementation of
the closed backend.
