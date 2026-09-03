export type AudioSource = "system" | "microphone" | "mixed";
export type Theme = "light" | "dark";
export type UiLanguage = "zh-CN" | "en";
export type SessionMode = "translation" | "transcription";
export type TranscriptionStyle = "verbatim" | "smart";

export type ThemeMode = "dark" | "light" | "system";
export type ColorTheme = "zinc" | "midnight" | "nord" | "forest" | "sepia";

export type SessionState =
  | "idle"
  | "connecting"
  | "reconnecting"
  | "listening"
  | "stopping"
  | "error";

export type AppError = {
  code: string;
  detail?: string;
};

export type AppSettings = {
  ui_language: UiLanguage;
  audio_source: AudioSource;
  session_mode: SessionMode;
  recognition_language: string;
  transcription_style: TranscriptionStyle;
  target_language: string;
  show_original: boolean;
  overlay_opacity: number;
  overlay_font_size: number;
  playback_enabled: boolean;
  theme_mode: ThemeMode;
  color_theme: ColorTheme;
};

export type TranscriptEntry = {
  id: string;
  source: string;
  translation: string;
  timestamp: string;
  is_final: boolean;
};

export type TranscriptionSegment = {
  id: string;
  session_id: number;
  text: string;
  timestamp: string;
  is_final: boolean;
};

export type TranscriptItem = TranscriptEntry | TranscriptionSegment;

export type SessionStatus = {
  state: SessionState;
  active: boolean;
  mode: SessionMode;
  session_id?: number;
  error?: AppError;
};

export const DEFAULT_SETTINGS: AppSettings = {
  ui_language: "zh-CN",
  audio_source: "system",
  session_mode: "translation",
  recognition_language: "auto",
  transcription_style: "verbatim",
  target_language: "zh-CN",
  show_original: true,
  overlay_opacity: 0.86,
  overlay_font_size: 28,
  playback_enabled: false,
  theme_mode: "system",
  color_theme: "zinc",
};

export const DEFAULT_SESSION_STATUS: SessionStatus = {
  state: "idle",
  active: false,
  mode: DEFAULT_SETTINGS.session_mode,
};

export const THEME_MODE_OPTIONS = [
  ["system", "theme.mode.system"],
  ["dark", "theme.mode.dark"],
  ["light", "theme.mode.light"],
] as const satisfies readonly (readonly [ThemeMode, string])[];

export const COLOR_THEME_OPTIONS = [
  {
    id: "zinc",
    nameKey: "theme.color.zinc",
    previewDark: "#0d0f12",
    previewLight: "#f8fafc",
    accent: "#60a5fa",
  },
  {
    id: "midnight",
    nameKey: "theme.color.midnight",
    previewDark: "#0b1120",
    previewLight: "#f0f4f9",
    accent: "#38bdf8",
  },
  {
    id: "nord",
    nameKey: "theme.color.nord",
    previewDark: "#131920",
    previewLight: "#f1f6f7",
    accent: "#2dd4bf",
  },
  {
    id: "forest",
    nameKey: "theme.color.forest",
    previewDark: "#0e1612",
    previewLight: "#f1f7f3",
    accent: "#34d399",
  },
  {
    id: "sepia",
    nameKey: "theme.color.sepia",
    previewDark: "#161310",
    previewLight: "#faf6f0",
    accent: "#fb923c",
  },
] as const;

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

export const RECOGNITION_LANGUAGE_OPTIONS = [
  ["auto", "language.auto"],
  ["cmn-Hans-CN", "language.recognition.mandarin"],
  ["yue-Hant-HK", "language.recognition.cantonese"],
  ["en-US", "language.recognition.english"],
  ["ja-JP", "language.recognition.japanese"],
  ["ko-KR", "language.recognition.korean"],
  ["es-ES", "language.recognition.spanish"],
  ["fr-FR", "language.recognition.french"],
  ["de-DE", "language.recognition.german"],
  ["ru-RU", "language.recognition.russian"],
] as const;

export const TRANSCRIPTION_STYLE_OPTIONS = [
  ["verbatim", "settings.transcriptionVerbatim"],
  ["smart", "settings.transcriptionSmart"],
] as const satisfies readonly (readonly [TranscriptionStyle, string])[];

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

export function isTranscriptionSegment(item: TranscriptItem): item is TranscriptionSegment {
  return "text" in item;
}
