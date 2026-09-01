use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioSource {
    System,
    Microphone,
    Mixed,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AppSettings {
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
    pub fn validate(&self) -> Result<(), String> {
        if self.target_language.trim().is_empty() || self.target_language.len() > 32 {
            return Err("目标语言代码无效。".into());
        }
        if !self.overlay_opacity.is_finite() || !(0.1..=1.0).contains(&self.overlay_opacity) {
            return Err("字幕不透明度必须在 10% 到 100% 之间。".into());
        }
        if !(12..=96).contains(&self.overlay_font_size) {
            return Err("字幕字体大小无效。".into());
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
    pub message: Option<String>,
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
            message: None,
        }
    }

    pub fn error(message: impl Into<String>, active: bool) -> Self {
        Self {
            state: SessionState::Error,
            active,
            message: Some(message.into()),
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
