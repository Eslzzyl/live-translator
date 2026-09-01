use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, Stream, StreamExt};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::Receiver;
use tokio::sync::oneshot;
use tokio::time::{timeout, Duration};
use tokio_tungstenite::tungstenite::Message;

use crate::audio::{AudioChunk, AudioMixer, AudioPlayback};
use crate::models::{AppSettings, AudioSource, SessionState, SessionStatus, TranscriptEntry};
use crate::network::connect_websocket;

use super::transcript::TranscriptAccumulator;

const ENDPOINT: &str =
    "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const MODEL: &str = "models/gemini-3.5-live-translate-preview";

pub enum SessionOutcome {
    Stopped,
}

pub async fn run_once(
    app: &AppHandle,
    api_key: &str,
    settings: &AppSettings,
    audio_rx: &mut Receiver<AudioChunk>,
    mixer: &mut AudioMixer,
    playback: Option<&AudioPlayback>,
    stop_rx: &mut oneshot::Receiver<()>,
) -> Result<SessionOutcome, String> {
    let url = format!("{ENDPOINT}?key={api_key}");
    let connection = timeout(Duration::from_secs(10), connect_websocket(&url))
        .await
        .map_err(|_| "Gemini 连接超时。请检查网络或系统代理设置。".to_string())??;
    let (mut socket, _) = connection;

    socket
        .send(Message::Text(setup_message(settings).to_string().into()))
        .await
        .map_err(|error| format!("无法发送 Gemini 配置：{error}"))?;

    timeout(Duration::from_secs(10), wait_for_setup(&mut socket))
        .await
        .map_err(|_| "Gemini 配置确认超时。".to_string())??;
    emit_status(app, SessionStatus::new(SessionState::Listening));

    let mut accumulator = TranscriptAccumulator::new();
    loop {
        tokio::select! {
            _ = &mut *stop_rx => {
                let _ = socket.close(None).await;
                return Ok(SessionOutcome::Stopped);
            }
            chunk = audio_rx.recv() => {
                let Some(chunk) = chunk else {
                    return Err("音频采集已停止。".into());
                };
                let pcm = if matches!(settings.audio_source, AudioSource::Mixed) {
                    mixer.push(chunk)
                } else {
                    chunk.pcm
                };
                if pcm.is_empty() {
                    continue;
                }
                let message = json!({
                    "realtimeInput": {
                        "audio": {
                            "data": STANDARD.encode(pcm),
                            "mimeType": "audio/pcm;rate=16000"
                        }
                    }
                });
                socket
                    .send(Message::Text(message.to_string().into()))
                    .await
                    .map_err(|error| format!("发送音频失败：{error}"))?;
            }
            message = socket.next() => {
                match message {
                    Some(Ok(Message::Close(frame))) => {
                        return Err(close_error("Gemini 连接已关闭", frame));
                    }
                    None => return Err("Gemini 连接已关闭。".into()),
                    Some(Ok(message)) => {
                        if let Some(text) = message_text(&message)? {
                            handle_server_message(app, text, &mut accumulator, playback)?;
                        }
                    }
                    Some(Err(error)) => return Err(format!("Gemini 会话异常：{error}")),
                }
            }
        }
    }
}

fn setup_message(settings: &AppSettings) -> Value {
    json!({
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
    })
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

async fn wait_for_setup<S>(socket: &mut S) -> Result<(), String>
where
    S: Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    while let Some(message) = socket.next().await {
        let message = message.map_err(|error| format!("Gemini 配置失败：{error}"))?;
        if let Message::Close(frame) = message {
            return Err(close_error("Gemini 配置被拒绝", frame));
        }
        let Some(text) = message_text(&message)? else {
            continue;
        };
        let value: Value =
            serde_json::from_str(text).map_err(|error| format!("Gemini 返回无效数据：{error}"))?;
        if let Some(error) = value.get("error") {
            return Err(format!("Gemini 配置被拒绝：{error}"));
        }
        if value.get("setupComplete").is_some() {
            return Ok(());
        }
    }
    Err("Gemini 未返回配置确认。".into())
}

fn message_text(message: &Message) -> Result<Option<&str>, String> {
    match message {
        Message::Text(text) => Ok(Some(text.as_ref())),
        Message::Binary(data) => std::str::from_utf8(data.as_ref())
            .map(Some)
            .map_err(|error| format!("Gemini 返回无效 UTF-8 数据：{error}")),
        _ => Ok(None),
    }
}

fn close_error(
    prefix: &str,
    frame: Option<tokio_tungstenite::tungstenite::protocol::CloseFrame>,
) -> String {
    let Some(frame) = frame else {
        return format!("{prefix}。");
    };
    if frame.reason.is_empty() {
        return format!("{prefix}（WebSocket {:?}）。", frame.code);
    }
    format!("{prefix}（WebSocket {:?}）：{}", frame.code, frame.reason)
}

fn handle_server_message(
    app: &AppHandle,
    text: &str,
    accumulator: &mut TranscriptAccumulator,
    playback: Option<&AudioPlayback>,
) -> Result<(), String> {
    let value: Value =
        serde_json::from_str(text).map_err(|error| format!("Gemini 返回无效数据：{error}"))?;
    if let Some(error) = value.get("error") {
        return Err(format!("Gemini 返回错误：{error}"));
    }

    let Some(content) = value.get("serverContent") else {
        return Ok(());
    };

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
            let bytes = STANDARD
                .decode(data)
                .map_err(|error| format!("Gemini 音频数据无效：{error}"))?;
            if let Some(playback) = playback {
                playback.push(&bytes);
            }
        }
    }

    if let Some(transcription) = content.get("interimInputTranscription") {
        accumulator.update_source_interim(transcription_text(transcription));
    }
    if let Some(transcription) = content.get("inputTranscription") {
        accumulator.commit_source(transcription_text(transcription));
    }
    if let Some(transcription) = content.get("outputTranscription") {
        accumulator.update_translation(
            transcription_text(transcription),
            transcription_finished(transcription, false),
        );
    }

    let turn_complete = content
        .get("turnComplete")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if turn_complete {
        accumulator.finalize_source_interim();
    }

    if accumulator.has_text() {
        emit_transcript(app, accumulator.entry(false));
    }

    if turn_complete && accumulator.has_text() {
        emit_transcript(app, accumulator.entry(true));
        accumulator.reset();
    }
    Ok(())
}

fn transcription_text(value: &Value) -> &str {
    value
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default()
}

fn transcription_finished(value: &Value, default: bool) -> bool {
    value
        .get("finished")
        .and_then(Value::as_bool)
        .unwrap_or(default)
}

fn emit_status(app: &AppHandle, status: SessionStatus) {
    let _ = app.emit("session-status", status);
}

fn emit_transcript(app: &AppHandle, entry: TranscriptEntry) {
    let _ = app.emit("transcript-update", entry);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setup_contains_translation_inside_generation_config() {
        let setup = setup_message(&AppSettings::default());
        assert_eq!(
            setup["setup"]["generationConfig"]["translationConfig"]["targetLanguageCode"],
            "zh-Hans"
        );
        assert!(setup["setup"]["generationConfig"]
            .get("inputAudioTranscription")
            .is_none());
        assert!(setup["setup"].get("inputAudioTranscription").is_some());
        assert!(setup["setup"].get("outputAudioTranscription").is_some());
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
}
