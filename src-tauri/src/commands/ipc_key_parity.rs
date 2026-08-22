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
    use crate::commands::workspaces::WorkspaceSeed;
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

        let seed = WorkspaceSeed {
            id: "local".to_string(),
            url: "http://127.0.0.1:3001".to_string(),
            source: "local".to_string(),
        };
        assert_eq!(
            emitted_keys(&serde_json::to_value(&seed).unwrap()),
            frozen("WorkspaceSeed")
        );

        // A guard on the guard: the frozen set must not be empty, or every
        // assertion above would pass against nothing.
        assert_eq!(
            frozen("BackendConfig"),
            vec![json!("baseUrl").as_str().unwrap().to_string()]
        );
    }
}
