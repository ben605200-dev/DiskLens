//! Tauri commands that bridge the UI to the scanner. The scan itself runs on
//! a plain background thread and reports back via events, so the UI never
//! blocks and the full file list never crosses the IPC boundary.

use std::os::windows::ffi::OsStrExt;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, State};

use windows_sys::Win32::Foundation::HANDLE;
use windows_sys::Win32::Security::{GetTokenInformation, TOKEN_ELEVATION, TokenElevation};
use windows_sys::Win32::UI::Shell::ShellExecuteW;

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
    excluded_paths: Option<Vec<String>>,
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
    let excluded = excluded_paths.unwrap_or_default();
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
            &excluded,
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

/// True when the app is running with administrator rights.
#[tauri::command]
pub fn is_elevated() -> bool {
    unsafe {
        // The pseudo-handle for the current process token: what
        // GetCurrentProcessToken() returns ((HANDLE)(LONG_PTR)-4). It must
        // never be closed.
        let process_token = (-4isize) as HANDLE;
        let mut elevation: TOKEN_ELEVATION = std::mem::zeroed();
        let mut size = std::mem::size_of::<TOKEN_ELEVATION>() as u32;
        let ok = GetTokenInformation(
            process_token,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            size,
            &mut size,
        );
        ok != 0 && elevation.TokenIsElevated != 0
    }
}

/// Relaunches the app elevated. Windows always shows its own UAC consent
/// prompt - the app never elevates silently - and the current instance only
/// exits after the elevated instance has been started.
#[tauri::command]
pub fn restart_as_admin(app: AppHandle) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let operation: Vec<u16> = "runas".encode_utf16().chain(std::iter::once(0)).collect();
    let file: Vec<u16> = exe
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    // 1 = SW_SHOWNORMAL. A return value <= 32 means the launch failed or the
    // user dismissed the UAC prompt.
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        )
    };
    if result as isize <= 32 {
        return Err("Elevation was cancelled.".to_string());
    }
    app.exit(0);
    Ok(())
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
