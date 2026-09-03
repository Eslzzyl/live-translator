import {
  ArrowRight,
  AudioWaveform,
  LoaderCircle,
  Mic,
  MonitorSpeaker,
  Play,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { SelectMenu } from "./SelectMenu";
import {
  AUDIO_SOURCE_OPTIONS,
  LANGUAGE_OPTIONS,
  RECOGNITION_LANGUAGE_OPTIONS,
  type AppSettings,
  type AudioSource,
  type SessionMode,
  type SessionStatus,
} from "../types";

export function ControlBar({
  settings,
  session,
  mode,
  onChange,
  onToggleSession,
}: {
  settings: AppSettings;
  session: SessionStatus;
  mode: SessionMode;
  onChange: (patch: Partial<AppSettings>) => void;
  onToggleSession: () => void;
}) {
  const { t } = useTranslation();
  const isRunning = session.active;
  const audioOptions = AUDIO_SOURCE_OPTIONS.map(([value, key]) => [value, t(key)] as const);
  const languageOptions = LANGUAGE_OPTIONS.map(([value, key]) => [value, t(key)] as const);
  const recognitionLanguageOptions = RECOGNITION_LANGUAGE_OPTIONS.map(
    ([value, key]) => [value, t(key)] as const,
  );

  const renderSourceIcon = () => {
    switch (settings.audio_source) {
      case "system":
        return <MonitorSpeaker size={16} className="control-icon" />;
      case "microphone":
        return <Mic size={16} className="control-icon" />;
      case "mixed":
        return <AudioWaveform size={16} className="control-icon" />;
    }
  };

  return (
    <section className="control-panel">
      <div className="control-items">
        <div className="control-field mode-field">
          <span className="control-label">{t("control.mode")}</span>
          <div className="mode-switch" role="group" aria-label={t("control.mode")}>
            <button
              type="button"
              className={mode === "translation" ? "selected" : ""}
              disabled={isRunning}
              onClick={() => onChange({ session_mode: "translation" })}
            >
              {t("control.translationMode")}
            </button>
            <button
              type="button"
              className={mode === "transcription" ? "selected" : ""}
              disabled={isRunning}
              onClick={() => onChange({ session_mode: "transcription", playback_enabled: false })}
            >
              {t("control.transcriptionMode")}
            </button>
          </div>
        </div>

        <div className="control-field">
          <span className="control-label">{t("control.audioSource")}</span>
          <div className="control-input-wrap">
            {renderSourceIcon()}
            <SelectMenu<AudioSource>
              className="source-select"
              value={settings.audio_source}
              options={audioOptions}
              onChange={(value) => onChange({ audio_source: value })}
              ariaLabel={t("control.audioSource")}
              disabled={isRunning}
            />
          </div>
        </div>

        {mode === "translation" ? (
          <div className="control-field language-field">
            <span className="control-label">{t("control.language")}</span>
            <div className="control-input-wrap language-flow">
              <span className="auto-pill">{t("language.auto")}</span>
              <ArrowRight size={13} className="flow-arrow" aria-hidden="true" />
              <SelectMenu
                className="language-select"
                value={settings.target_language}
                options={languageOptions}
                onChange={(value) => onChange({ target_language: value })}
                ariaLabel={t("control.targetLanguage")}
                disabled={isRunning}
              />
            </div>
          </div>
        ) : (
          <div className="control-field language-field">
            <span className="control-label">{t("control.recognitionLanguage")}</span>
            <div className="control-input-wrap">
              <SelectMenu
                className="language-select"
                value={settings.recognition_language}
                options={recognitionLanguageOptions}
                onChange={(value) => onChange({ recognition_language: value })}
                ariaLabel={t("control.recognitionLanguage")}
                disabled={isRunning}
              />
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`primary-button session-button ${session.state === "listening" || session.state === "reconnecting" ? "active" : ""}`}
        onClick={onToggleSession}
      >
        {session.state === "connecting" || session.state === "reconnecting" ? (
          <LoaderCircle className="spin" size={16} />
        ) : isRunning ? (
          <Square size={14} fill="currentColor" />
        ) : (
          <Play size={15} fill="currentColor" />
        )}
        <span>
          {isRunning
            ? mode === "transcription"
              ? t("control.stopTranscription")
              : t("control.stopTranslation")
            : mode === "transcription"
              ? t("control.startTranscription")
              : t("control.startTranslation")}
        </span>
      </button>
    </section>
  );
}
