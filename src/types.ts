export type AudioSource = "system" | "microphone" | "mixed";
export type Theme = "light" | "dark";
export type UiLanguage = "zh-CN" | "en";

export type SessionState = "idle" | "connecting" | "listening" | "stopping" | "error";

export type AppError = {
  code: string;
  detail?: string;
};

export type AppSettings = {
  ui_language: UiLanguage;
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
  error?: AppError;
};

export const DEFAULT_SETTINGS: AppSettings = {
  ui_language: "zh-CN",
  audio_source: "system",
  target_language: "zh-CN",
  show_original: true,
  overlay_opacity: 0.86,
  overlay_font_size: 28,
  playback_enabled: false,
};

export const LANGUAGE_OPTIONS = [
  ["zh-CN", "language.targets.simplifiedChinese"],
  ["zh-TW", "language.targets.traditionalChinese"],
  ["en", "language.targets.english"],
  ["ja", "language.targets.japanese"],
  ["ko", "language.targets.korean"],
  ["es", "language.targets.spanish"],
  ["fr", "language.targets.french"],
  ["de", "language.targets.german"],
  ["ru", "language.targets.russian"],
] as const;

export const UI_LANGUAGE_OPTIONS = [
  ["zh-CN", "language.ui.simplifiedChinese"],
  ["en", "language.ui.english"],
] as const satisfies readonly (readonly [UiLanguage, string])[];

export const AUDIO_SOURCE_OPTIONS = [
  ["system", "audioSources.system"],
  ["microphone", "audioSources.microphone"],
  ["mixed", "audioSources.mixed"],
] as const satisfies readonly (readonly [AudioSource, string])[];

export function languageName(code: string, translate: (key: string) => string) {
  if (code === "auto") return translate("language.auto");
  const option = LANGUAGE_OPTIONS.find(([value]) => value === code);
  return option ? translate(option[1]) : code;
}
