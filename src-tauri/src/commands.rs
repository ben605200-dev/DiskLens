//! Tauri commands that bridge the UI to the scanner. The scan itself runs on
//! a plain background thread and reports back via events, so the UI never
//! blocks and the full file list never crosses the IPC boundary.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, State};

use crate::scanner;

/// Cancel flag of the currently running scan, if any.
#[derive(Default)]
pub struct ScanState(pub Mutex<Option<Arc<AtomicBool>>>);

/// Starts a scan of `path` in the background. Emits `scan-progress`,
/// `scan-finished` (with the summary) or `scan-failed` events.
#[tauri::command]
pub async fn scan_start(
    app: AppHandle,
    state: State<'_, ScanState>,
    path: String,
) -> Result<(), String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err("That path is not a folder.".to_string());
    }

    let flag = Arc::new(AtomicBool::new(false));
    {
        let mut guard = state.0.lock().unwrap();
        if let Some(previous) = guard.take() {
            // Starting a new scan cancels the previous one.
            previous.store(true, Ordering::Relaxed);
        }
        *guard = Some(flag.clone());
    }

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let progress_app = app_handle.clone();
        let result = scanner::scan(&root, &flag, move |progress| {
            let _ = progress_app.emit("scan-progress", progress);
        });
        match result {
            Ok(summary) => {
                let _ = app_handle.emit("scan-finished", &summary);
            }
            Err(error) => {
                let _ = app_handle.emit("scan-failed", error.to_string());
            }
        }
    });

    Ok(())
}

/// Asks the running scan to stop; it returns within about a second.
#[tauri::command]
pub fn scan_cancel(state: State<'_, ScanState>) -> Result<(), String> {
    if let Some(flag) = state.0.lock().unwrap().as_ref() {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}
