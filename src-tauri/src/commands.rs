use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, State};
use tokio::sync::oneshot;

use crate::credentials;
use crate::models::{
    AppError, AppSettings, SessionMode, SessionState, SessionStatus, TranscriptionSegment,
};
use crate::{session, settings};

#[derive(Clone)]
pub struct AppState {
    pub active_session: Arc<Mutex<Option<ActiveSession>>>,
    transcription_tail: Arc<Mutex<Option<ActiveTranscription>>>,
    next_session_id: Arc<AtomicU64>,
}

const TRANSCRIPTION_TAIL_LIMIT: usize = 4;

struct ActiveTranscription {
    session_id: u64,
    segments: Vec<TranscriptionSegment>,
}

pub struct ActiveSession {
    pub stop: Option<oneshot::Sender<()>>,
    pub id: u64,
    pub mode: SessionMode,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            active_session: Arc::new(Mutex::new(None)),
            transcription_tail: Arc::new(Mutex::new(None)),
            next_session_id: Arc::new(AtomicU64::new(1)),
        }
    }

    pub fn prepare_session(&self, session_id: u64, mode: &SessionMode) {
        if let Ok(mut transcription) = self.transcription_tail.lock() {
            *transcription = if matches!(mode, SessionMode::Transcription) {
                Some(ActiveTranscription {
                    session_id,
                    segments: Vec::new(),
                })
            } else {
                None
            };
        }
    }

    pub fn update_transcription(&self, segment: TranscriptionSegment) {
        let Ok(mut transcription) = self.transcription_tail.lock() else {
            return;
        };
        let Some(active) = transcription.as_mut() else {
            return;
        };
        if active.session_id != segment.session_id {
            return;
        }
        if let Some(existing) = active
            .segments
            .iter_mut()
            .find(|item| item.id == segment.id)
        {
            *existing = segment;
        } else {
            active.segments.push(segment);
            if active.segments.len() > TRANSCRIPTION_TAIL_LIMIT {
                let excess = active.segments.len() - TRANSCRIPTION_TAIL_LIMIT;
                active.segments.drain(..excess);
            }
        }
    }

    pub fn transcription_tail(&self) -> Result<Vec<TranscriptionSegment>, AppError> {
        self.transcription_tail
            .lock()
            .map(|transcription| {
                transcription
                    .as_ref()
                    .map(|active| active.segments.clone())
                    .unwrap_or_default()
            })
            .map_err(|_| AppError::new("runtime.state_unavailable"))
    }

    pub fn clear_transcription(&self) -> Result<(), AppError> {
        self.transcription_tail
            .lock()
            .map(|mut transcription| {
                if let Some(active) = transcription.as_mut() {
                    active.segments.clear();
                }
            })
            .map_err(|_| AppError::new("runtime.state_unavailable"))
    }

    pub fn finish(&self, id: u64) {
        if let Ok(mut active) = self.active_session.lock() {
            if active.as_ref().is_some_and(|session| session.id == id) {
                *active = None;
            }
        }
    }
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<AppSettings, AppError> {
    settings::load(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), AppError> {
    settings::save(&app, &settings)
}

#[tauri::command]
pub fn export_transcript(app: AppHandle, content: String) -> Result<String, AppError> {
    settings::export(&app, &content)
}

#[tauri::command]
pub fn get_api_key_status() -> Result<bool, AppError> {
    credentials::read_api_key().map(|value| value.is_some())
}

#[tauri::command]
pub fn save_api_key(api_key: String) -> Result<(), AppError> {
    credentials::save_api_key(&api_key)
}

#[tauri::command]
pub fn start_translation(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), AppError> {
    settings.validate()?;
    let api_key =
        credentials::read_api_key()?.ok_or_else(|| AppError::new("credentials.missing"))?;
    let mut active = state
        .active_session
        .lock()
        .map_err(|_| AppError::new("runtime.state_unavailable"))?;
    if active.is_some() {
        return Err(AppError::new("session.already_running"));
    }

    let id = state.next_session_id.fetch_add(1, Ordering::Relaxed);
    state.prepare_session(id, &settings.session_mode);
    let (stop_tx, stop_rx) = oneshot::channel();
    *active = Some(ActiveSession {
        stop: Some(stop_tx),
        id,
        mode: settings.session_mode.clone(),
    });
    drop(active);

    let app_for_thread = app.clone();
    session::spawn(
        app_for_thread,
        settings,
        api_key,
        stop_rx,
        id,
        Arc::new(state.inner().clone()),
    );
    Ok(())
}

#[tauri::command]
pub fn get_transcription_tail(
    state: State<'_, AppState>,
) -> Result<Vec<TranscriptionSegment>, AppError> {
    state.transcription_tail()
}

#[tauri::command]
pub fn clear_transcription(state: State<'_, AppState>) -> Result<(), AppError> {
    state.clear_transcription()
}

#[tauri::command]
pub fn stop_translation(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    let mut active = state
        .active_session
        .lock()
        .map_err(|_| AppError::new("runtime.state_unavailable"))?;
    let Some(session) = active.as_mut() else {
        return Ok(());
    };
    let _ = tauri::Emitter::emit(
        &app,
        "session-status",
        SessionStatus::new(
            SessionState::Stopping,
            session.mode.clone(),
            Some(session.id),
        ),
    );
    if let Some(stop) = session.stop.take() {
        let _ = stop.send(());
    }
    Ok(())
}
