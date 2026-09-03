use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::sync::oneshot;

use crate::audio::{AudioCapture, AudioMixer, AudioPlayback};
use crate::commands::AppState;
use crate::gemini::{self, SessionOutcome};
use crate::models::{AppError, AppSettings, SessionState, SessionStatus};

pub fn spawn(
    app: AppHandle,
    settings: AppSettings,
    api_key: String,
    stop_rx: oneshot::Receiver<()>,
    session_id: u64,
    state: Arc<AppState>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let state_for_cleanup = Arc::clone(&state);
        let runtime = match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(runtime) => runtime,
            Err(error) => {
                let _ = app.emit(
                    "session-status",
                    SessionStatus::error(
                        AppError::with_detail("runtime.unavailable", error.to_string()),
                        false,
                        settings.session_mode.clone(),
                        Some(session_id),
                    ),
                );
                state_for_cleanup.finish(session_id);
                return;
            }
        };
        runtime.block_on(run(app, settings, api_key, stop_rx, session_id, state));
        state_for_cleanup.finish(session_id);
    })
}

async fn run(
    app: AppHandle,
    settings: AppSettings,
    api_key: String,
    mut stop_rx: oneshot::Receiver<()>,
    session_id: u64,
    state: Arc<AppState>,
) {
    let (audio_tx, mut audio_rx) = mpsc::channel(256);
    let mut capture = match AudioCapture::start(&settings.audio_source, audio_tx.clone()) {
        Ok(capture) => capture,
        Err(error) => {
            let _ = app.emit(
                "session-status",
                SessionStatus::error(
                    error,
                    false,
                    settings.session_mode.clone(),
                    Some(session_id),
                ),
            );
            return;
        }
    };
    let playback = match AudioPlayback::start(
        settings.playback_enabled
            && matches!(
                &settings.session_mode,
                crate::models::SessionMode::Translation
            ),
    ) {
        Ok(playback) => playback,
        Err(error) => {
            let _ = app.emit(
                "session-status",
                SessionStatus::error(
                    error,
                    false,
                    settings.session_mode.clone(),
                    Some(session_id),
                ),
            );
            return;
        }
    };
    let mut mixer = AudioMixer::new();
    let _ = app.emit(
        "session-status",
        SessionStatus::new(
            SessionState::Connecting,
            settings.session_mode.clone(),
            Some(session_id),
        ),
    );
    let mut resume_handle = None;
    let mut audio_buffer = Vec::new();
    let mut session_resumption = true;
    let mut context_window_compression = true;

    loop {
        let audio_health = capture.health();
        log::info!(
            "[session] run_attempt session_resumption={} context_window_compression={} resume_handle_present={}",
            session_resumption,
            context_window_compression,
            resume_handle.is_some()
        );
        match gemini::run_once(
            &app,
            &api_key,
            &settings,
            gemini::RunContext {
                audio_rx: &mut audio_rx,
                mixer: &mut mixer,
                playback: playback.as_ref(),
                stop_rx: &mut stop_rx,
                resume_handle: &mut resume_handle,
                audio_buffer: &mut audio_buffer,
                audio_health: &audio_health,
                session_id,
                state: &state,
            },
            gemini::RunOptions {
                session_resumption,
                context_window_compression,
            },
        )
        .await
        {
            Ok(SessionOutcome::Stopped) => {
                let _ = app.emit("audio-level", 0.0f32);
                let _ = app.emit(
                    "session-status",
                    SessionStatus::new(
                        SessionState::Idle,
                        settings.session_mode.clone(),
                        Some(session_id),
                    ),
                );
                return;
            }
            Ok(SessionOutcome::Reconnect) => {
                log::warn!("[session] server_requested_reconnect");
                let _ = app.emit("audio-level", 0.0f32);
                let _ = app.emit(
                    "session-status",
                    SessionStatus::new(
                        SessionState::Reconnecting,
                        settings.session_mode.clone(),
                        Some(session_id),
                    ),
                );
            }
            Err(error) => {
                log::error!("[session] run_error code={}", error.code);
                if error.code == "audio.capture_stalled" {
                    log::warn!(
                        "[session] audio_capture_stalled; recreating_capture_stream detail={}",
                        error.detail.as_deref().unwrap_or("none")
                    );
                    drop(capture);
                    capture = match AudioCapture::start(&settings.audio_source, audio_tx.clone()) {
                        Ok(capture) => capture,
                        Err(restart_error) => {
                            log::error!(
                                "[session] audio_capture_restart_failed code={}",
                                restart_error.code
                            );
                            let _ = app.emit(
                                "session-status",
                                SessionStatus::error(
                                    restart_error,
                                    false,
                                    settings.session_mode.clone(),
                                    Some(session_id),
                                ),
                            );
                            return;
                        }
                    };
                }
                if error.code == "gemini.setup_rejected" {
                    if session_resumption {
                        log::warn!(
                            "[session] setup_rejected; disabling_session_resumption_and_retrying"
                        );
                        session_resumption = false;
                        resume_handle = None;
                        let _ = app.emit(
                            "session-status",
                            SessionStatus::new(
                                SessionState::Reconnecting,
                                settings.session_mode.clone(),
                                Some(session_id),
                            ),
                        );
                        continue;
                    }
                    if context_window_compression {
                        log::warn!(
                            "[session] setup_rejected; disabling_context_window_compression_and_retrying"
                        );
                        context_window_compression = false;
                        resume_handle = None;
                        let _ = app.emit(
                            "session-status",
                            SessionStatus::new(
                                SessionState::Reconnecting,
                                settings.session_mode.clone(),
                                Some(session_id),
                            ),
                        );
                        continue;
                    }
                }
                let _ = app.emit("audio-level", 0.0f32);
                let response_stalled = error.code == "gemini.response_stalled";
                let _ = app.emit(
                    "session-status",
                    SessionStatus::error(
                        error,
                        true,
                        settings.session_mode.clone(),
                        Some(session_id),
                    ),
                );
                if response_stalled {
                    log::warn!("[session] response_stalled; retrying_without_delay");
                } else {
                    tokio::select! {
                        _ = &mut stop_rx => {
                            let _ = app.emit(
                                "session-status",
                                SessionStatus::new(
                                    SessionState::Idle,
                                    settings.session_mode.clone(),
                                    Some(session_id),
                                ),
                            );
                            return;
                        }
                        _ = tokio::time::sleep(Duration::from_secs(2)) => {}
                    }
                }
                let _ = app.emit(
                    "session-status",
                    SessionStatus::new(
                        SessionState::Reconnecting,
                        settings.session_mode.clone(),
                        Some(session_id),
                    ),
                );
            }
        }
    }
}
