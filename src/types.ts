export type AudioSource = "system" | "microphone" | "mixed";
export type Theme = "light" | "dark";

export type SessionState = "idle" | "connecting" | "listening" | "stopping" | "error";

export type AppSettings = {
  audio_source: AudioSource;
  target_language: string;
  show_original: boolean;
  overlay_opacity: number;
  overlay_font_size: number;
  playback_enabled: boolean;
};

export type TranscriptEntry = {
  id: string;
  source: string;
  translation: string;
  timestamp: string;
  is_final: boolean;
};

export type SessionStatus = {
  state: SessionState;
  active: boolean;
  message?: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  audio_source: "system",
  target_language: "zh-CN",
  show_original: true,
  overlay_opacity: 0.86,
  overlay_font_size: 28,
  playback_enabled: false,
};

export const LANGUAGE_OPTIONS = [
  ["zh-CN", "简体中文"],
  ["zh-TW", "繁體中文"],
  ["en", "English"],
  ["ja", "日本語"],
  ["ko", "한국어"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["ru", "Русский"],
] as const;

export const AUDIO_SOURCE_OPTIONS = [
  ["system", "系统声音"],
  ["microphone", "麦克风"],
  ["mixed", "系统声音 + 麦克风"],
] as const satisfies readonly (readonly [AudioSource, string])[];

export function languageName(code: string) {
  if (code === "auto") return "自动识别";
  return LANGUAGE_OPTIONS.find(([value]) => value === code)?.[1] ?? code;
}
