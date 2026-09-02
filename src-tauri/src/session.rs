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
                    ),
                );
                state_for_cleanup.finish(session_id);
                return;
            }
        };
        runtime.block_on(run(app, settings, api_key, stop_rx, session_id));
        state.finish(session_id);
    })
}

async fn run(
    app: AppHandle,
    settings: AppSettings,
    api_key: String,
    mut stop_rx: oneshot::Receiver<()>,
    _session_id: u64,
) {
    let (audio_tx, mut audio_rx) = mpsc::channel(64);
    let _capture = match AudioCapture::start(&settings.audio_source, audio_tx) {
        Ok(capture) => capture,
        Err(error) => {
            let _ = app.emit("session-status", SessionStatus::error(error, false));
            return;
        }
    };
    let playback = match AudioPlayback::start(settings.playback_enabled) {
        Ok(playback) => playback,
        Err(error) => {
            let _ = app.emit("session-status", SessionStatus::error(error, false));
            return;
        }
    };
    let mut mixer = AudioMixer::new();
    let _ = app.emit(
        "session-status",
        SessionStatus::new(SessionState::Connecting),
    );

    loop {
        match gemini::run_once(
            &app,
            &api_key,
            &settings,
            &mut audio_rx,
            &mut mixer,
            playback.as_ref(),
            &mut stop_rx,
        )
        .await
        {
            Ok(SessionOutcome::Stopped) => {
                let _ = app.emit("session-status", SessionStatus::new(SessionState::Idle));
                return;
            }
            Err(error) => {
                let _ = app.emit("session-status", SessionStatus::error(error, true));
                tokio::select! {
                    _ = &mut stop_rx => {
                        let _ = app.emit("session-status", SessionStatus::new(SessionState::Idle));
                        return;
                    }
                    _ = tokio::time::sleep(Duration::from_secs(2)) => {}
                }
                let _ = app.emit(
                    "session-status",
                    SessionStatus::new(SessionState::Connecting),
                );
            }
        }
    }
}
