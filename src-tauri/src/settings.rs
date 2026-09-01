use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::models::AppSettings;

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("无法定位配置目录：{error}"))?;
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建配置目录：{error}"))?;
    Ok(directory.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&path).map_err(|error| format!("无法读取配置：{error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("配置格式无效：{error}"))
}

pub fn save(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let content =
        serde_json::to_string_pretty(settings).map_err(|error| format!("无法编码配置：{error}"))?;
    fs::write(path, content).map_err(|error| format!("无法保存配置：{error}"))
}

pub fn export(app: &AppHandle, content: &str) -> Result<String, String> {
    let directory = app
        .path()
        .download_dir()
        .map_err(|error| format!("无法定位下载目录：{error}"))?;
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建下载目录：{error}"))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| format!("系统时间无效：{error}"))?
        .as_secs();
    let path = directory.join(format!("live-transcript-{timestamp}.txt"));
    fs::write(&path, content).map_err(|error| format!("无法导出字幕：{error}"))?;
    Ok(path.to_string_lossy().into_owned())
}
