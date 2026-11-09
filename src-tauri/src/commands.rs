//! Tauri commands that bridge the UI to the scanner. The scan itself runs on
//! a plain background thread and reports back via events, so the UI never
//! blocks and the full file list never crosses the IPC boundary.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, State};

use crate::scanner::{self, LastScan};

/// Cancel flag of the currently running scan, if any.
#[derive(Default)]
pub struct ScanState(pub Mutex<Option<Arc<AtomicBool>>>);

/// Shared handle to the most recent scanned tree (for drill-in views).
pub struct LastScanState(pub Arc<LastScan>);

/// Starts a scan of `path` in the background. Emits `scan-progress`,
/// `scan-finished` (with the summary) or `scan-failed` events.
#[tauri::command]
pub async fn scan_start(
    app: AppHandle,
    state: State<'_, ScanState>,
    last_scan: State<'_, LastScanState>,
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

    let shared_tree = last_scan.0.clone();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let progress_app = app_handle.clone();
        let result = scanner::scan(
            &root,
            &flag,
            move |progress| {
                let _ = progress_app.emit("scan-progress", progress);
            },
            Some(shared_tree),
        );
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

/// Lists a folder's direct children from the last completed scan, biggest
/// first (capped at 500). Used by the treemap to drill into folders without
/// re-scanning and without ever sending the full file list.
#[tauri::command]
pub fn list_children(
    last_scan: State<'_, LastScanState>,
    path: String,
) -> Result<Vec<scanner::ChildOut>, String> {
    last_scan.0.list_children(&path)
}

/// Replaces the user profile prefix with `%USERPROFILE%`, so paths copied
/// out of the app never expose the Windows username.
#[tauri::command]
pub fn mask_path(path: String) -> String {
    let Ok(profile) = std::env::var("USERPROFILE") else {
        return path;
    };
    match strip_prefix_ci(&path, &profile) {
        Some(rest) => format!("%USERPROFILE%{rest}"),
        None => path,
    }
}

fn strip_prefix_ci<'a>(s: &'a str, prefix: &str) -> Option<&'a str> {
    if s.len() < prefix.len() || !s.is_char_boundary(prefix.len()) {
        return None;
    }
    let head = &s[..prefix.len()];
    if head.to_lowercase() == prefix.to_lowercase() {
        Some(&s[prefix.len()..])
    } else {
        None
    }
}
