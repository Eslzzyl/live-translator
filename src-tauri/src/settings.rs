use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::models::{AppError, AppSettings};

fn settings_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| AppError::with_detail("settings.path", error.to_string()))?;
    fs::create_dir_all(&directory)
        .map_err(|error| AppError::with_detail("settings.directory", error.to_string()))?;
    Ok(directory.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Result<AppSettings, AppError> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|error| AppError::with_detail("settings.read", error.to_string()))?;
    serde_json::from_str(&content)
        .map_err(|error| AppError::with_detail("settings.invalid_file", error.to_string()))
}

pub fn save(app: &AppHandle, settings: &AppSettings) -> Result<(), AppError> {
    let path = settings_path(app)?;
    let content = serde_json::to_string_pretty(settings)
        .map_err(|error| AppError::with_detail("settings.encode", error.to_string()))?;
    fs::write(path, content)
        .map_err(|error| AppError::with_detail("settings.write", error.to_string()))
}

pub fn export(app: &AppHandle, content: &str) -> Result<String, AppError> {
    let directory = app
        .path()
        .download_dir()
        .map_err(|error| AppError::with_detail("export.path", error.to_string()))?;
    fs::create_dir_all(&directory)
        .map_err(|error| AppError::with_detail("export.directory", error.to_string()))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| AppError::with_detail("export.time", error.to_string()))?
        .as_secs();
    let path = directory.join(format!("live-transcript-{timestamp}.txt"));
    fs::write(&path, content)
        .map_err(|error| AppError::with_detail("export.write", error.to_string()))?;
    Ok(path.to_string_lossy().into_owned())
}
