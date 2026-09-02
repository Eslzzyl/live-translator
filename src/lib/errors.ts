import type { TFunction } from "i18next";
import type { AppError } from "../types";

const ERROR_TRANSLATION_KEYS = {
  "credentials.missing": "errors.credentialsMissing",
  "credentials.empty_key": "errors.credentialsEmpty",
  "credentials.read_failed": "errors.credentialsReadFailed",
  "credentials.save_failed": "errors.credentialsSaveFailed",
  "credentials.readback_failed": "errors.credentialsReadbackFailed",
  "session.already_running": "errors.sessionAlreadyRunning",
  "runtime.state_unavailable": "errors.stateUnavailable",
  "runtime.unavailable": "errors.runtimeUnavailable",
  "audio.microphone_missing": "errors.audioMicrophoneMissing",
  "audio.device_enumeration_failed": "errors.audioDeviceEnumerationFailed",
  "audio.system_unavailable.windows": "errors.audioSystemUnavailableWindows",
  "audio.system_unavailable.linux": "errors.audioSystemUnavailableLinux",
  "audio.system_unavailable.macos": "errors.audioSystemUnavailableMacos",
  "audio.system_unavailable": "errors.audioSystemUnavailable",
  "audio.system_permission_required": "errors.audioSystemPermissionRequired",
  "audio.sample_format_unsupported": "errors.audioSampleFormatUnsupported",
  "audio.stream_create_failed": "errors.audioStreamCreateFailed",
  "audio.stream_start_failed": "errors.audioStreamStartFailed",
  "audio.capture_stalled": "errors.audioCaptureStalled",
  "audio.config_failed": "errors.audioConfigFailed",
  "audio.playback_device_missing": "errors.audioPlaybackDeviceMissing",
  "audio.playback_config_failed": "errors.audioPlaybackConfigFailed",
  "audio.playback_sample_format_unsupported": "errors.audioPlaybackSampleFormatUnsupported",
  "audio.playback_stream_create_failed": "errors.audioPlaybackStreamCreateFailed",
  "audio.playback_stream_start_failed": "errors.audioPlaybackStreamStartFailed",
  "gemini.connection_timeout": "errors.geminiConnectionTimeout",
  "gemini.setup_send_failed": "errors.geminiSetupSendFailed",
  "gemini.setup_timeout": "errors.geminiSetupTimeout",
  "gemini.audio_capture_stopped": "errors.geminiAudioCaptureStopped",
  "gemini.audio_send_failed": "errors.geminiAudioSendFailed",
  "gemini.audio_send_timeout": "errors.geminiAudioSendTimeout",
  "gemini.response_stalled": "errors.geminiResponseStalled",
  "gemini.connection_closed": "errors.geminiConnectionClosed",
  "gemini.setup_failed": "errors.geminiSetupFailed",
  "gemini.setup_rejected": "errors.geminiSetupRejected",
  "gemini.setup_invalid_data": "errors.geminiSetupInvalidData",
  "gemini.setup_not_confirmed": "errors.geminiSetupNotConfirmed",
  "gemini.invalid_data": "errors.geminiInvalidData",
  "gemini.server_error": "errors.geminiServerError",
  "gemini.audio_invalid": "errors.geminiAudioInvalid",
  "gemini.session_failed": "errors.geminiSessionFailed",
  "network.direct_connection_failed": "errors.networkDirectConnectionFailed",
  "network.proxy_connection_failed": "errors.networkProxyConnectionFailed",
  "network.proxy_tunnel_failed": "errors.networkProxyTunnelFailed",
  "network.proxy_websocket_failed": "errors.networkProxyWebsocketFailed",
  "network.proxy_settings_failed": "errors.networkProxySettingsFailed",
  "network.proxy_connect_request_failed": "errors.networkProxyConnectRequestFailed",
  "network.proxy_response_read_failed": "errors.networkProxyResponseReadFailed",
  "network.proxy_closed": "errors.networkProxyClosed",
  "network.proxy_header_too_large": "errors.networkProxyHeaderTooLarge",
  "network.proxy_status": "errors.networkProxyStatus",
  "settings.path": "errors.settingsPath",
  "settings.directory": "errors.settingsDirectory",
  "settings.read": "errors.settingsRead",
  "settings.invalid_file": "errors.settingsInvalidFile",
  "settings.encode": "errors.settingsEncode",
  "settings.write": "errors.settingsWrite",
  "export.path": "errors.exportPath",
  "export.directory": "errors.exportDirectory",
  "export.time": "errors.exportTime",
  "export.write": "errors.exportWrite",
  "window.caption_show": "errors.windowCaptionShow",
  "window.caption_focus": "errors.windowCaptionFocus",
  "window.caption_create": "errors.windowCaptionCreate",
  "window.caption_load_timeout": "errors.windowCaptionLoadTimeout",
  "window.caption_ready_lost": "errors.windowCaptionReadyLost",
  "window.caption_close": "errors.windowCaptionClose",
  "settings.invalid_target_language": "errors.settingsInvalidTargetLanguage",
  "settings.invalid_opacity": "errors.settingsInvalidOpacity",
  "settings.invalid_font_size": "errors.settingsInvalidFontSize",
} as const;

type ErrorTranslationKey =
  | (typeof ERROR_TRANSLATION_KEYS)[keyof typeof ERROR_TRANSLATION_KEYS]
  | "errors.connectionFallback"
  | "errors.unknown";

export function toAppError(error: unknown): AppError {
  if (typeof error === "object" && error !== null && "code" in error) {
    const value = error as { code?: unknown; detail?: unknown };
    if (typeof value.code === "string" && value.code.length > 0) {
      return {
        code: value.code,
        ...(typeof value.detail === "string" && value.detail.length > 0
          ? { detail: value.detail }
          : {}),
      };
    }
  }

  return {
    code: "unknown",
    ...(typeof error === "string" && error.length > 0 ? { detail: error } : {}),
  };
}

export function createAppError(code: string, detail?: string): AppError {
  return {
    code,
    ...(detail ? { detail } : {}),
  };
}

export function formatAppError(
  error: unknown,
  t: TFunction,
  fallbackKey: ErrorTranslationKey = "errors.unknown",
) {
  const normalized = toAppError(error);
  const translationKey =
    ERROR_TRANSLATION_KEYS[normalized.code as keyof typeof ERROR_TRANSLATION_KEYS] ?? fallbackKey;
  const message = t(translationKey);
  return normalized.detail && translationKey === fallbackKey
    ? `${message}: ${normalized.detail}`
    : normalized.detail
      ? `${message} (${normalized.detail})`
      : message;
}
