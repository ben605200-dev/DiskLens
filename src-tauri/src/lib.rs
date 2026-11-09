pub mod commands;
pub mod drives;
pub mod scanner;

use commands::{LastScanState, ScanState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ScanState::default())
        .manage(LastScanState(std::sync::Arc::new(
            scanner::LastScan::default(),
        )))
        .invoke_handler(tauri::generate_handler![
            commands::scan_start,
            commands::scan_cancel,
            commands::list_children,
            commands::mask_path,
            drives::list_drives
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
