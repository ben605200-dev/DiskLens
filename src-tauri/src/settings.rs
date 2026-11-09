//! App settings, persisted as JSON in the standard app-data folder.
//! Loading is deliberately forgiving: a missing or corrupt file falls back
//! to defaults so the app always starts.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// "system" | "dark" | "light"
    pub theme: String,
    /// Accent color as a hex string (see the presets in the UI).
    pub accent: String,
    /// "comfortable" | "compact"
    pub density: String,
    /// "binary" (GiB, 1024-based) | "decimal" (GB, 1000-based)
    pub size_units: String,
    /// "dashboard" | "details"
    pub default_view: String,
    /// 10 | 25 | 50 | 100
    pub default_top_n: u32,
    /// "bar" | "donut"
    pub default_graph: String,
    /// Folders that are never scanned.
    pub excluded_paths: Vec<String>,
    /// Base font size in px (13..=18).
    pub font_size: u32,
    pub reduce_motion: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "system".to_string(),
            accent: "#0369A1".to_string(),
            density: "comfortable".to_string(),
            size_units: "binary".to_string(),
            default_view: "dashboard".to_string(),
            default_top_n: 25,
            default_graph: "bar".to_string(),
            excluded_paths: Vec::new(),
            font_size: 16,
            reduce_motion: false,
        }
    }
}

/// Reads settings from `path`; defaults on missing/corrupt content.
pub fn load_from(path: &Path) -> Settings {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Writes settings as pretty JSON, creating the folder if needed.
pub fn save_to(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<Settings, String> {
    Ok(load_from(&settings_path(&app)?))
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    save_to(&settings_path(&app)?, &settings)
}
