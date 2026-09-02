use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, Stream, StreamExt};
use serde_json::{json, Value};
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::Receiver;
use tokio::sync::oneshot;
use tokio::time::{timeout, Duration};
use tokio_tungstenite::tungstenite::Message;

use crate::audio::{AudioChunk, AudioHealth, AudioMixer, AudioPlayback};
use crate::models::{
    AppError, AppSettings, AudioSource, SessionState, SessionStatus, TranscriptEntry,
};
use crate::network::connect_websocket;

use super::transcript::TranscriptAccumulator;

const ENDPOINT: &str =
    "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const MODEL: &str = "models/gemini-3.5-live-translate-preview";
const AUDIO_PACKET_BYTES: usize = 3_200;
const SOCKET_SEND_TIMEOUT: Duration = Duration::from_secs(5);
const AUDIO_STALL_TIMEOUT: Duration = Duration::from_secs(3);
const RESPONSE_STALL_TIMEOUT: Duration = Duration::from_secs(15);
const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(15);
const LOCAL_SEGMENT_IDLE: Duration = Duration::from_secs(3);
const MAX_SEGMENT_DURATION: Duration = Duration::from_secs(10);

pub enum SessionOutcome {
    Stopped,
    Reconnect,
}

pub struct RunContext<'a> {
    pub audio_rx: &'a mut Receiver<AudioChunk>,
    pub mixer: &'a mut AudioMixer,
    pub playback: Option<&'a AudioPlayback>,
    pub stop_rx: &'a mut oneshot::Receiver<()>,
    pub resume_handle: &'a mut Option<String>,
    pub audio_buffer: &'a mut Vec<u8>,
    pub audio_health: &'a AudioHealth,
}

pub struct RunOptions {
    pub session_resumption: bool,
    pub context_window_compression: bool,
}

pub async fn run_once(
    app: &AppHandle,
    api_key: &str,
    settings: &AppSettings,
    context: RunContext<'_>,
    options: RunOptions,
) -> Result<SessionOutcome, AppError> {
    let RunContext {
        audio_rx,
        mixer,
        playback,
        stop_rx,
        resume_handle,
        audio_buffer,
        audio_health,
    } = context;
    let RunOptions {
        session_resumption,
        context_window_compression,
    } = options;
    let url = format!("{ENDPOINT}?key={api_key}");
    let connection = timeout(Duration::from_secs(10), connect_websocket(&url))
        .await
        .map_err(|_| AppError::new("gemini.connection_timeout"))??;
    let (mut socket, _) = connection;
    log::info!(
        "[gemini] websocket_connected session_resumption={} context_window_compression={} resume_handle_present={}",
        session_resumption,
        context_window_compression,
        resume_handle.is_some()
    );

    let setup = setup_message(
        settings,
        if session_resumption {
            resume_handle.as_deref()
        } else {
            None
        },
        session_resumption,
        context_window_compression,
    );
    timeout(
        SOCKET_SEND_TIMEOUT,
        socket.send(Message::Text(setup.to_string().into())),
    )
    .await
    .map_err(|_| AppError::new("gemini.setup_send_failed"))?
    .map_err(|error| AppError::with_detail("gemini.setup_send_failed", error.to_string()))?;

    timeout(Duration::from_secs(10), wait_for_setup(&mut socket))
        .await
        .map_err(|_| AppError::new("gemini.setup_timeout"))??;
    let discarded_chunks = discard_pending_audio(audio_rx);
    if discarded_chunks > 0 {
        log::info!(
            "[audio] discarded_pending_chunks count={} before_session_start",
            discarded_chunks
        );
    }
    *mixer = AudioMixer::new();
    audio_buffer.clear();
    emit_status(app, SessionStatus::new(SessionState::Listening));

    let mut accumulator = TranscriptAccumulator::new();
    let mut last_level_emit = Instant::now();
    let mut current_peak: f32 = 0.0;
    let mut last_audio_received = Instant::now();
    let mut last_speech: Option<Instant> = None;
    let mut speech_started_at: Option<Instant> = None;
    let mut last_transcript_update: Option<Instant> = None;
    let mut segment_started_at: Option<Instant> = None;
    let mut last_keepalive = Instant::now();
    let mut sent_audio_packets = 0u64;
    let mut last_server_content_at: Option<Instant> = None;
    let mut health_tick = tokio::time::interval(Duration::from_secs(1));
    loop {
        tokio::select! {
            _ = &mut *stop_rx => {
                let _ = socket.close(None).await;
                emit_audio_level(app, 0.0);
                return Ok(SessionOutcome::Stopped);
            }
            chunk = audio_rx.recv() => {
                let Some(chunk) = chunk else {
                    emit_audio_level(app, 0.0);
                    return Err(AppError::new("gemini.audio_capture_stopped"));
                };
                last_audio_received = Instant::now();
                let pcm = if matches!(settings.audio_source, AudioSource::Mixed) {
                    mixer.push(chunk)
                } else {
                    chunk.pcm
                };
                if pcm.is_empty() {
                    continue;
                }
                let chunk_level = calculate_audio_level(&pcm);
                current_peak = current_peak.max(chunk_level);
                if chunk_level > 0.02 {
                    let speech_at = Instant::now();
                    if last_speech
                        .map(|last| last.elapsed() >= LOCAL_SEGMENT_IDLE)
                        .unwrap_or(true)
                    {
                        speech_started_at = Some(speech_at);
                    }
                    last_speech = Some(speech_at);
                }

                if last_level_emit.elapsed() >= Duration::from_millis(50) {
                    emit_audio_level(app, current_peak);
                    current_peak *= 0.65;
                    if current_peak < 0.01 {
                        current_peak = 0.0;
                    }
                    last_level_emit = std::time::Instant::now();
                }
                let mut packet = take_audio_packet(audio_buffer, &pcm);
                while let Some(packet_bytes) = packet {
                    let message = json!({
                        "realtimeInput": {
                            "audio": {
                                "data": STANDARD.encode(packet_bytes),
                                "mimeType": "audio/pcm;rate=16000"
                            }
                        }
                    });
                    match timeout(
                        SOCKET_SEND_TIMEOUT,
                        socket.send(Message::Text(message.to_string().into())),
                    )
                    .await
                    {
                        Ok(Ok(())) => {
                            sent_audio_packets += 1;
                        }
                        Ok(Err(error)) => {
                            emit_audio_level(app, 0.0);
                            return Err(AppError::with_detail(
                                "gemini.audio_send_failed",
                                error.to_string(),
                            ));
                        }
                        Err(_) => {
                            emit_audio_level(app, 0.0);
                            return Err(AppError::new("gemini.audio_send_timeout"));
                        }
                    }
                    packet = take_audio_packet(audio_buffer, &[]);
                }
            }
            message = socket.next() => {
                match message {
                    Some(Ok(Message::Close(frame))) => {
                        emit_audio_level(app, 0.0);
                        return Err(close_error("gemini.connection_closed", frame));
                    }
                    None => {
                        emit_audio_level(app, 0.0);
                        return Err(AppError::new("gemini.connection_closed"));
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        timeout(SOCKET_SEND_TIMEOUT, socket.send(Message::Pong(payload)))
                            .await
                            .map_err(|_| AppError::new("gemini.session_failed"))?
                            .map_err(|error| AppError::with_detail("gemini.session_failed", error.to_string()))?;
                    }
                    Some(Ok(Message::Pong(_))) => {
                    }
                    Some(Ok(message)) => {
                        if let Some(text) = message_text(&message)? {
                            match handle_server_message(
                                app,
                                text,
                                &mut accumulator,
                                playback,
                                resume_handle,
                                &mut last_server_content_at,
                            )? {
                                ServerMessageOutcome::Reconnect => {
                                    emit_audio_level(app, 0.0);
                                    return Ok(SessionOutcome::Reconnect);
                                }
                                ServerMessageOutcome::Continue {
                                    transcript_changed,
                                    segment_complete,
                                } => {
                                    if segment_complete {
                                        last_transcript_update = None;
                                        segment_started_at = None;
                                    } else if transcript_changed {
                                        let updated_at = Instant::now();
                                        last_transcript_update = Some(updated_at);
                                        if segment_started_at.is_none() {
                                            segment_started_at = Some(updated_at);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Some(Err(error)) => {
                        emit_audio_level(app, 0.0);
                        return Err(AppError::with_detail("gemini.session_failed", error.to_string()));
                    }
                }
            }
            _ = health_tick.tick() => {
                if last_audio_received.elapsed() > AUDIO_STALL_TIMEOUT {
                    emit_audio_level(app, 0.0);
                    return Err(AppError::with_detail(
                        "audio.capture_stalled",
                        format!(
                            "no audio callback for {:?}; callbacks={}, dropped_chunks={}, stream_errors={}, xrun_count={}",
                            last_audio_received.elapsed(),
                            audio_health.callback_count(),
                            audio_health.dropped_chunks(),
                            audio_health.stream_errors(),
                            audio_health.xrun_count(),
                        ),
                    ));
                }
                if let Some(last_speech) = last_speech {
                    let response_stalled = response_stalled(
                        Instant::now(),
                        speech_started_at,
                        Some(last_speech),
                        last_server_content_at,
                    );
                    if response_stalled {
                        log::warn!(
                            "[gemini] response_stalled speech_age={:?} speech_started_age={:?} server_content_age={:?} sent_audio_packets={}",
                            last_speech.elapsed(),
                            speech_started_at.map(|started| started.elapsed()),
                            last_server_content_at.map(|last| last.elapsed()),
                            sent_audio_packets,
                        );
                        emit_audio_level(app, 0.0);
                        return Err(AppError::new("gemini.response_stalled"));
                    }
                }
                if let Some(last_update) = last_transcript_update {
                    let speech_has_stopped = last_speech
                        .map(|last| last.elapsed() >= LOCAL_SEGMENT_IDLE)
                        .unwrap_or(true);
                    if accumulator.has_translation()
                        && speech_has_stopped
                        && last_update.elapsed() >= LOCAL_SEGMENT_IDLE
                    {
                        accumulator.finalize_source_interim();
                        if accumulator.has_text() {
                            emit_transcript(app, accumulator.entry(true));
                            accumulator.reset();
                        }
                        last_transcript_update = None;
                        segment_started_at = None;
                    }
                }
                if let Some(segment_duration) = segment_started_at
                    .map(|started| started.elapsed())
                    .filter(|duration| *duration >= MAX_SEGMENT_DURATION)
                {
                    if accumulator.has_text() {
                        log::info!(
                            "[gemini] local_segment_timeout duration={:?}",
                            segment_duration,
                        );
                        accumulator.finalize_source_interim();
                        emit_transcript(app, accumulator.entry(true));
                        accumulator.reset();
                        last_transcript_update = None;
                        segment_started_at = None;
                    }
                }
                if last_keepalive.elapsed() >= KEEPALIVE_INTERVAL {
                    timeout(SOCKET_SEND_TIMEOUT, socket.send(Message::Ping(Vec::new().into())))
                        .await
                        .map_err(|_| AppError::new("gemini.session_failed"))?
                        .map_err(|error| AppError::with_detail("gemini.session_failed", error.to_string()))?;
                    last_keepalive = Instant::now();
                }
            }
        }
    }
}

fn setup_message(
    settings: &AppSettings,
    resume_handle: Option<&str>,
    session_resumption: bool,
    context_window_compression: bool,
) -> Value {
    let mut setup = json!({
        "setup": {
            "model": MODEL,
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "translationConfig": {
                    "targetLanguageCode": target_language_code(&settings.target_language),
                    "echoTargetLanguage": false
                }
            },
            "inputAudioTranscription": {},
            "outputAudioTranscription": {}
        }
    });
    if session_resumption {
        setup["setup"]["sessionResumption"] = match resume_handle {
            Some(handle) => json!({ "handle": handle }),
            None => json!({}),
        };
    }
    if context_window_compression {
        setup["setup"]["contextWindowCompression"] = json!({
            "slidingWindow": {}
        });
    }
    setup
}

fn target_language_code(code: &str) -> &str {
    match code {
        "zh-CN" | "zh" => "zh-Hans",
        "zh-TW" | "zh-Hant" => "zh-Hant",
        "pt" => "pt-BR",
        "iw" => "he",
        value => value,
    }
}

async fn wait_for_setup<S>(socket: &mut S) -> Result<(), AppError>
where
    S: Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    while let Some(message) = socket.next().await {
        let message = message
            .map_err(|error| AppError::with_detail("gemini.setup_failed", error.to_string()))?;
        if let Message::Close(frame) = message {
            return Err(close_error("gemini.setup_rejected", frame));
        }
        let Some(text) = message_text(&message)? else {
            continue;
        };
        let value: Value = serde_json::from_str(text).map_err(|error| {
            AppError::with_detail("gemini.setup_invalid_data", error.to_string())
        })?;
        if let Some(error) = value.get("error") {
            return Err(AppError::with_detail(
                "gemini.setup_rejected",
                error.to_string(),
            ));
        }
        if value.get("setupComplete").is_some() {
            return Ok(());
        }
    }
    Err(AppError::new("gemini.setup_not_confirmed"))
}

fn message_text(message: &Message) -> Result<Option<&str>, AppError> {
    match message {
        Message::Text(text) => Ok(Some(text.as_ref())),
        Message::Binary(data) => std::str::from_utf8(data.as_ref())
            .map(Some)
            .map_err(|error| AppError::with_detail("gemini.invalid_data", error.to_string())),
        _ => Ok(None),
    }
}

fn close_error(
    code: &str,
    frame: Option<tokio_tungstenite::tungstenite::protocol::CloseFrame>,
) -> AppError {
    let Some(frame) = frame else {
        return AppError::new(code);
    };
    if frame.reason.is_empty() {
        return AppError::with_detail(code, format!("WebSocket {:?}", frame.code));
    }
    AppError::with_detail(
        code,
        format!("WebSocket {:?}: {}", frame.code, frame.reason),
    )
}

fn response_stalled(
    now: Instant,
    speech_started_at: Option<Instant>,
    last_speech: Option<Instant>,
    last_server_content_at: Option<Instant>,
) -> bool {
    let Some(speech_started_at) = speech_started_at else {
        return false;
    };
    let Some(last_speech) = last_speech else {
        return false;
    };
    if now.duration_since(last_speech) > RESPONSE_STALL_TIMEOUT {
        return false;
    }

    let response_started_at = last_server_content_at
        .map(|last| last.max(speech_started_at))
        .unwrap_or(speech_started_at);
    now.duration_since(response_started_at) > RESPONSE_STALL_TIMEOUT
}

fn handle_server_message(
    app: &AppHandle,
    text: &str,
    accumulator: &mut TranscriptAccumulator,
    playback: Option<&AudioPlayback>,
    resume_handle: &mut Option<String>,
    last_server_content_at: &mut Option<Instant>,
) -> Result<ServerMessageOutcome, AppError> {
    let value: Value = serde_json::from_str(text)
        .map_err(|error| AppError::with_detail("gemini.invalid_data", error.to_string()))?;
    if let Some(error) = value.get("error") {
        return Err(AppError::with_detail(
            "gemini.server_error",
            error.to_string(),
        ));
    }

    if let Some(update) = value.get("sessionResumptionUpdate") {
        if update
            .get("resumable")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            if let Some(handle) = update.get("newHandle").and_then(Value::as_str) {
                if !handle.is_empty() {
                    *resume_handle = Some(handle.to_string());
                }
            }
        }
    }
    if value.get("goAway").is_some() {
        log::warn!("[gemini] go_away received; reconnecting");
        return Ok(ServerMessageOutcome::Reconnect);
    }

    let Some(content) = value.get("serverContent") else {
        return Ok(ServerMessageOutcome::Continue {
            transcript_changed: false,
            segment_complete: false,
        });
    };
    *last_server_content_at = Some(Instant::now());

    if let Some(parts) = content
        .get("modelTurn")
        .and_then(|turn| turn.get("parts"))
        .and_then(Value::as_array)
    {
        for part in parts {
            let Some(inline_data) = part.get("inlineData") else {
                continue;
            };
            let mime_type = inline_data
                .get("mimeType")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if !mime_type.starts_with("audio/pcm") {
                continue;
            }
            let Some(data) = inline_data.get("data").and_then(Value::as_str) else {
                continue;
            };
            let bytes = STANDARD.decode(data).map_err(|error| {
                AppError::with_detail("gemini.audio_invalid", error.to_string())
            })?;
            if let Some(playback) = playback {
                playback.push(&bytes);
            }
        }
    }

    let mut transcript_changed = false;
    if let Some(transcription) = content.get("interimInputTranscription") {
        let text = transcription_text(transcription);
        transcript_changed = transcript_changed || !text.is_empty();
        accumulator.update_source_interim(text);
    }
    if let Some(transcription) = content.get("inputTranscription") {
        let text = transcription_text(transcription);
        transcript_changed = transcript_changed || !text.is_empty();
        accumulator.commit_source(text);
    }
    if let Some(transcription) = content.get("outputTranscription") {
        let text = transcription_text(transcription);
        transcript_changed = transcript_changed || !text.is_empty();
        accumulator.update_translation(text, false);
    }

    let generation_complete = content
        .get("generationComplete")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let turn_complete = content
        .get("turnComplete")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let interrupted = content
        .get("interrupted")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let segment_complete = generation_complete || turn_complete || interrupted;
    if segment_complete {
        accumulator.finalize_source_interim();
    }

    if accumulator.has_text() {
        emit_transcript(app, accumulator.entry(false));
    }

    if segment_complete && accumulator.has_text() {
        emit_transcript(app, accumulator.entry(true));
        accumulator.reset();
    }
    Ok(ServerMessageOutcome::Continue {
        transcript_changed,
        segment_complete,
    })
}

enum ServerMessageOutcome {
    Continue {
        transcript_changed: bool,
        segment_complete: bool,
    },
    Reconnect,
}

fn transcription_text(value: &Value) -> &str {
    value
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default()
}

fn emit_status(app: &AppHandle, status: SessionStatus) {
    let _ = app.emit("session-status", status);
}

fn emit_transcript(app: &AppHandle, entry: TranscriptEntry) {
    let _ = app.emit("transcript-update", entry);
}

fn emit_audio_level(app: &AppHandle, level: f32) {
    let _ = app.emit("audio-level", level);
}

fn calculate_audio_level(pcm: &[u8]) -> f32 {
    let (chunks, _) = pcm.as_chunks::<2>();
    if chunks.is_empty() {
        return 0.0;
    }
    let mut sum_sq = 0.0f64;
    let mut peak = 0.0f32;
    for chunk in chunks {
        let val = i16::from_le_bytes(*chunk);
        let sample = val as f64 / 32768.0;
        sum_sq += sample * sample;
        let abs_sample = (val as f32 / 32768.0).abs();
        if abs_sample > peak {
            peak = abs_sample;
        }
    }
    let rms = (sum_sq / chunks.len() as f64).sqrt() as f32;
    let combined = rms * 0.4 + peak * 0.6;

    if combined < 0.002 {
        0.0
    } else {
        let normalized = ((combined - 0.002) / 0.07).clamp(0.0, 1.0);
        normalized.sqrt()
    }
}

fn take_audio_packet(buffer: &mut Vec<u8>, pcm: &[u8]) -> Option<Vec<u8>> {
    buffer.extend_from_slice(pcm);
    (buffer.len() >= AUDIO_PACKET_BYTES).then(|| buffer.drain(..AUDIO_PACKET_BYTES).collect())
}

fn discard_pending_audio(audio_rx: &mut Receiver<AudioChunk>) -> usize {
    let mut discarded_chunks = 0;
    while audio_rx.try_recv().is_ok() {
        discarded_chunks += 1;
    }
    discarded_chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setup_contains_translation_inside_generation_config() {
        let setup = setup_message(&AppSettings::default(), None, true, true);
        assert_eq!(
            setup["setup"]["generationConfig"]["translationConfig"]["targetLanguageCode"],
            "zh-Hans"
        );
        assert!(setup["setup"]["generationConfig"]
            .get("inputAudioTranscription")
            .is_none());
        assert!(setup["setup"]["generationConfig"]
            .get("outputAudioTranscription")
            .is_none());
        assert!(setup["setup"].get("inputAudioTranscription").is_some());
        assert!(setup["setup"].get("outputAudioTranscription").is_some());
        assert!(setup["setup"].get("sessionResumption").is_some());
        assert!(setup["setup"].get("contextWindowCompression").is_some());
    }

    #[test]
    fn setup_can_disable_optional_long_session_features() {
        let setup = setup_message(&AppSettings::default(), None, false, false);
        assert!(setup["setup"].get("sessionResumption").is_none());
        assert!(setup["setup"].get("contextWindowCompression").is_none());
    }

    #[test]
    fn audio_packetizer_emits_fixed_100ms_packets() {
        let mut buffer = Vec::new();
        assert!(take_audio_packet(&mut buffer, &[0; AUDIO_PACKET_BYTES - 2]).is_none());
        let packet = take_audio_packet(&mut buffer, &[0; 4]).expect("packet should be ready");
        assert_eq!(packet.len(), AUDIO_PACKET_BYTES);
        assert_eq!(buffer.len(), 2);
    }

    #[test]
    fn binary_json_frames_are_read_as_text() {
        let message = Message::Binary(br#"{ "setupComplete": {} }"#.to_vec().into());
        assert_eq!(
            message_text(&message).expect("binary JSON should be valid"),
            Some(r#"{ "setupComplete": {} }"#)
        );
    }

    #[test]
    fn target_language_codes_match_live_translate_names() {
        assert_eq!(target_language_code("zh-CN"), "zh-Hans");
        assert_eq!(target_language_code("zh-TW"), "zh-Hant");
        assert_eq!(target_language_code("en"), "en");
    }

    #[test]
    fn response_stall_waits_for_timeout_without_initial_server_content() {
        let now = Instant::now();
        assert!(!response_stalled(now, Some(now), Some(now), None));
        assert!(response_stalled(
            now,
            Some(now - RESPONSE_STALL_TIMEOUT - Duration::from_secs(1)),
            Some(now),
            None,
        ));
    }
}
