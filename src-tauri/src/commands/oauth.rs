use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager};

/// True when `path` is an OAuth callback route the backend lands the popup on
/// after a successful (or errored) consent exchange. BUG 3 (DEC-3 / INV-5): the
/// success callback now returns a self-closing HTML page; the RELIABLE close of
/// the NATIVE Tauri popup is this Rust-side handler — not the page's
/// best-effort `window.close()`, which is unreliable on a native webview.
/// Covers the google compatibility alias `/oauth/callback` and the namespaced
/// `/auth/sources/<id>/callback`.
fn is_oauth_callback_path(path: &str) -> bool {
    path == "/oauth/callback"
        || (path.starts_with("/auth/sources/") && path.ends_with("/callback"))
}

/// Open a new webview window for OAuth authentication.
/// Called from the frontend when window.open() is not available (Tauri).
#[tauri::command]
pub async fn open_oauth_window(app: AppHandle, url: String) -> Result<(), String> {
    // Close existing OAuth window if any
    if let Some(existing) = app.get_webview_window("google-oauth") {
        let _ = existing.close();
    }

    tauri::WebviewWindowBuilder::new(
        &app,
        "google-oauth",
        tauri::WebviewUrl::External(url.parse().map_err(|e| format!("Invalid URL: {e}"))?),
    )
    .title("Sign in with Google")
    .inner_size(520.0, 720.0)
    .center()
    // BUG 3 (DEC-3 / INV-5): close the native popup from Rust once the callback
    // page has FINISHED loading. `on_page_load(Finished)` fires AFTER the backend
    // callback response loads (the connection is already persisted), unlike
    // `on_navigation` which runs at navigation-decision time with only a `&Url`
    // and can race/abort the callback before it persists.
    .on_page_load(|window, payload| {
        if payload.event() == PageLoadEvent::Finished
            && is_oauth_callback_path(payload.url().path())
        {
            let _ = window.close();
        }
    })
    .build()
    .map_err(|e| format!("Failed to create OAuth window: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_oauth_callback_path;

    /// tst_desktop_oauth_close_001 (INV-5): the callback-path matcher accepts the
    /// google alias and the namespaced source callback, and rejects the consent
    /// page + non-callback paths so the popup is not closed mid-flow.
    #[test]
    fn tst_desktop_oauth_close_001_callback_path_match() {
        assert!(is_oauth_callback_path("/oauth/callback"));
        assert!(is_oauth_callback_path("/auth/sources/google/callback"));
        assert!(is_oauth_callback_path("/auth/sources/telegram/callback"));
        // not a callback → leave the popup open.
        assert!(!is_oauth_callback_path("/auth/sources/google/start"));
        assert!(!is_oauth_callback_path("/o/oauth2/auth"));
        assert!(!is_oauth_callback_path("/oauth/callback/extra"));
        assert!(!is_oauth_callback_path("/"));
    }
}
