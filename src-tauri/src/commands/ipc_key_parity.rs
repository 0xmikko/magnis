//! The Rust half of the IPC key gate.
//!
//! `invoke<T>()` on the TypeScript side is an unchecked cast, so nothing in the
//! frontend's typecheck, its unit tests or Playwright can notice that a command
//! stopped emitting the key its caller reads. Here we ask serde itself what it
//! emits — not the source text — and compare against the frozen key set that
//! the TypeScript half is checked against by the same file.

#[cfg(test)]
mod tests {
    use crate::commands::backend::BackendConfig;
    use crate::commands::workspaces::{
        WorkspaceConfigResponse, WorkspaceEntry, WorkspaceSelectionResponse,
    };
    use serde_json::{json, Value};

    /// The frozen key sets, read from the file the TypeScript side is also
    /// checked against. A literal here would let the two halves drift apart
    /// while both stayed green.
    fn frozen(struct_name: &str) -> Vec<String> {
        // Sorted, because a JSON object has no meaningful key order:
        // `serde_json::Value` stores one in a BTreeMap, so what serde "emits"
        // arrives alphabetically. The contract is the key SET.
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../backend/test/fixtures/wire/tauri-ipc-keys.json"
        );
        let text = std::fs::read_to_string(path).expect("frozen IPC key set is readable");
        let document: Value = serde_json::from_str(&text).expect("frozen IPC key set is JSON");
        let mut keys = document[struct_name]
            .as_array()
            .unwrap_or_else(|| panic!("{struct_name} is not in the frozen key set"))
            .iter()
            .map(|key| key.as_str().expect("key is a string").to_string())
            .collect::<Vec<_>>();
        keys.sort();
        keys
    }

    fn emitted_keys(value: &Value) -> Vec<String> {
        let mut keys: Vec<String> = value
            .as_object()
            .expect("a struct serializes to an object")
            .keys()
            .cloned()
            .collect();
        keys.sort();
        keys
    }

    #[test]
    fn tst_desktop_ipc_key_parity_001_serde_emits_the_frozen_keys() {
        let config = BackendConfig {
            base_url: "http://127.0.0.1:3001".to_string(),
        };
        assert_eq!(
            emitted_keys(&serde_json::to_value(&config).unwrap()),
            frozen("BackendConfig"),
            "BackendConfig: what serde emits is what the frontend reads"
        );

        let entry = WorkspaceEntry {
            id: "local".to_string(),
            label: "Local".to_string(),
            kind: "local".to_string(),
            api_base_url: Some("http://127.0.0.1:3001".to_string()),
            auth_method: Some("open".to_string()),
        };
        assert_eq!(
            emitted_keys(&serde_json::to_value(&entry).unwrap()),
            frozen("WorkspaceEntry")
        );

        // Nesting is covered by construction: serializing the response
        // serializes the entry inside it, so a walker over the type graph would
        // be more machinery than the thing it guards.
        let response = WorkspaceConfigResponse {
            selected_workspace_id: "local".to_string(),
            workspaces: vec![entry],
        };
        let serialized = serde_json::to_value(&response).unwrap();
        assert_eq!(emitted_keys(&serialized), frozen("WorkspaceConfigResponse"));
        assert_eq!(
            emitted_keys(&serialized["workspaces"][0]),
            frozen("WorkspaceEntry"),
            "the nested entry keeps its own key set"
        );

        let selection = WorkspaceSelectionResponse {
            selected_workspace_id: "local".to_string(),
        };
        assert_eq!(
            emitted_keys(&serde_json::to_value(&selection).unwrap()),
            frozen("WorkspaceSelectionResponse")
        );

        // A guard on the guard: the frozen set must not be empty, or every
        // assertion above would pass against nothing.
        assert_eq!(frozen("BackendConfig"), vec![json!("baseUrl").as_str().unwrap().to_string()]);
    }
}
