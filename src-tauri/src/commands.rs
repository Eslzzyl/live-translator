use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, State};
use tokio::sync::oneshot;

use crate::credentials;
use crate::models::{AppSettings, SessionState, SessionStatus};
use crate::{session, settings};

#[derive(Clone)]
pub struct AppState {
    pub active_session: Arc<Mutex<Option<ActiveSession>>>,
    next_session_id: Arc<AtomicU64>,
}

pub struct ActiveSession {
    pub stop: Option<oneshot::Sender<()>>,
    pub id: u64,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            active_session: Arc::new(Mutex::new(None)),
            next_session_id: Arc::new(AtomicU64::new(1)),
        }
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
pub fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    settings::load(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    settings::save(&app, &settings)
}

#[tauri::command]
pub fn export_transcript(app: AppHandle, content: String) -> Result<String, String> {
    settings::export(&app, &content)
}

#[tauri::command]
pub fn get_api_key_status() -> Result<bool, String> {
    credentials::read_api_key().map(|value| value.is_some())
}

#[tauri::command]
pub fn save_api_key(api_key: String) -> Result<(), String> {
    credentials::save_api_key(&api_key)
}

#[tauri::command]
pub fn start_translation(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    settings.validate()?;
    let api_key = credentials::read_api_key()?
        .ok_or_else(|| "请先在设置中保存 Gemini API Key。".to_string())?;
    let mut active = state
        .active_session
        .lock()
        .map_err(|_| "会话状态不可用。".to_string())?;
    if active.is_some() {
        return Err("翻译会话已经在运行。".into());
    }

    let id = state.next_session_id.fetch_add(1, Ordering::Relaxed);
    let (stop_tx, stop_rx) = oneshot::channel();
    *active = Some(ActiveSession {
        stop: Some(stop_tx),
        id,
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
pub fn stop_translation(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut active = state
        .active_session
        .lock()
        .map_err(|_| "会话状态不可用。".to_string())?;
    let Some(session) = active.as_mut() else {
        return Ok(());
    };
    let _ = tauri::Emitter::emit(
        &app,
        "session-status",
        SessionStatus::new(SessionState::Stopping),
    );
    if let Some(stop) = session.stop.take() {
        let _ = stop.send(());
    }
    Ok(())
}
