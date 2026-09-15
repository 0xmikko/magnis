fn main() {
    // Cargo exposes the host target triple as `TARGET` inside build scripts
    // only. Re-export it under a stable name so `src/backend_process.rs`
    // can resolve the Tauri `externalBin` sidecar name
    // (`pglite-server-<triple>`). Tauri's runtime does not surface the
    // triple, and `std::env::consts::{ARCH,OS}` lack the vendor/env pieces.
    let target = std::env::var("TARGET").expect("TARGET env var set by cargo for build scripts");
    println!("cargo:rustc-env=MAGNIS_TARGET_TRIPLE={target}");

    tauri_build::build()
}
