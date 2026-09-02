use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AppError {
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl AppError {
    pub fn new(code: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            detail: None,
        }
    }

    pub fn with_detail(code: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            detail: Some(detail.into()),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.detail {
            Some(detail) => write!(formatter, "{}: {detail}", self.code),
            None => formatter.write_str(&self.code),
        }
    }
}

impl std::error::Error for AppError {}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioSource {
    System,
    Microphone,
    Mixed,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub enum UiLanguage {
    #[serde(rename = "zh-CN")]
    #[default]
    SimplifiedChinese,
    #[serde(rename = "en")]
    English,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AppSettings {
    #[serde(default)]
    pub ui_language: UiLanguage,
    pub audio_source: AudioSource,
    pub target_language: String,
    pub show_original: bool,
    pub overlay_opacity: f32,
    pub overlay_font_size: u16,
    pub playback_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ui_language: UiLanguage::default(),
            audio_source: AudioSource::System,
            target_language: "zh-CN".into(),
            show_original: true,
            overlay_opacity: 0.86,
            overlay_font_size: 28,
            playback_enabled: false,
        }
    }
}

impl AppSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.target_language.trim().is_empty() || self.target_language.len() > 32 {
            return Err(AppError::new("settings.invalid_target_language"));
        }
        if !self.overlay_opacity.is_finite() || !(0.1..=1.0).contains(&self.overlay_opacity) {
            return Err(AppError::new("settings.invalid_opacity"));
        }
        if !(12..=96).contains(&self.overlay_font_size) {
            return Err(AppError::new("settings.invalid_font_size"));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Idle,
    Connecting,
    Listening,
    Stopping,
    Error,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SessionStatus {
    pub state: SessionState,
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<AppError>,
}

impl SessionStatus {
    pub fn new(state: SessionState) -> Self {
        let active = matches!(
            state,
            SessionState::Connecting | SessionState::Listening | SessionState::Stopping
        );
        Self {
            state,
            active,
            error: None,
        }
    }

    pub fn error(error: AppError, active: bool) -> Self {
        Self {
            state: SessionState::Error,
            active,
            error: Some(error),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TranscriptEntry {
    pub id: String,
    pub source: String,
    pub translation: String,
    pub timestamp: String,
    pub is_final: bool,
}

#[cfg(test)]
mod tests {
    use super::{AppSettings, UiLanguage};

    #[test]
    fn legacy_settings_default_to_simplified_chinese() {
        let settings: AppSettings = serde_json::from_str(
            r#"{
                "audio_source": "system",
                "target_language": "zh-CN",
                "show_original": true,
                "overlay_opacity": 0.86,
                "overlay_font_size": 28,
                "playback_enabled": false
            }"#,
        )
        .expect("legacy settings should remain readable");

        assert!(matches!(
            settings.ui_language,
            UiLanguage::SimplifiedChinese
        ));
    }

    #[test]
    fn ui_language_uses_stable_wire_values() {
        let settings = AppSettings {
            ui_language: UiLanguage::English,
            ..AppSettings::default()
        };
        let value = serde_json::to_value(settings).expect("settings should serialize");

        assert_eq!(value["ui_language"], "en");
    }
}
