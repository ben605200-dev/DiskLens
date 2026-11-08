//! Lists local drives with capacity information (Windows only).

use serde::Serialize;
use windows_sys::Win32::Storage::FileSystem::{
    GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives,
};

// Stable drive-type values from winbase.h.
const DRIVE_REMOVABLE: u32 = 2;
const DRIVE_FIXED: u32 = 3;
const DRIVE_REMOTE: u32 = 4;
const DRIVE_CDROM: u32 = 5;
const DRIVE_RAMDISK: u32 = 6;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    /// Drive letter, e.g. "C:".
    pub letter: String,
    /// Root path, e.g. "C:\\".
    pub root: String,
    /// "fixed", "removable", "remote", "cdrom" or "ramdisk".
    pub drive_type: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub used_bytes: u64,
}

/// Returns every usable drive with total/used/free space. Drives that
/// cannot report capacity (e.g. empty card readers) are omitted.
#[tauri::command]
pub fn list_drives() -> Vec<DriveInfo> {
    let mask = unsafe { GetLogicalDrives() };
    let mut drives = Vec::new();

    for i in 0..26u32 {
        if mask & (1 << i) == 0 {
            continue;
        }
        let letter = format!("{}:", (b'A' + i as u8) as char);
        let root = format!("{letter}\\");
        let wide: Vec<u16> = root.encode_utf16().chain(std::iter::once(0)).collect();

        let drive_type = unsafe { GetDriveTypeW(wide.as_ptr()) };
        let type_name = match drive_type {
            DRIVE_FIXED => "fixed",
            DRIVE_REMOVABLE => "removable",
            DRIVE_REMOTE => "remote",
            DRIVE_CDROM => "cdrom",
            DRIVE_RAMDISK => "ramdisk",
            _ => continue, // no root directory or unknown: not scannable
        };

        let mut available = 0u64;
        let mut total = 0u64;
        let mut total_free = 0u64;
        let ok = unsafe {
            GetDiskFreeSpaceExW(wide.as_ptr(), &mut available, &mut total, &mut total_free)
        };
        if ok == 0 || total == 0 {
            continue;
        }
        let _ = available; // only total/free are shown for now

        drives.push(DriveInfo {
            letter,
            root,
            drive_type: type_name.to_string(),
            total_bytes: total,
            free_bytes: total_free,
            used_bytes: total - total_free,
        });
    }

    drives
}
