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
  type AppSettings,
  type AudioSource,
  type SessionStatus,
} from "../types";

export function ControlBar({
  settings,
  session,
  onChange,
  onToggleSession,
}: {
  settings: AppSettings;
  session: SessionStatus;
  onChange: (patch: Partial<AppSettings>) => void;
  onToggleSession: () => void;
}) {
  const { t } = useTranslation();
  const isRunning = session.active;
  const audioOptions = AUDIO_SOURCE_OPTIONS.map(([value, key]) => [value, t(key)] as const);
  const languageOptions = LANGUAGE_OPTIONS.map(([value, key]) => [value, t(key)] as const);

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
            />
          </div>
        </div>

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
            />
          </div>
        </div>
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
        <span>{isRunning ? t("control.stopTranslation") : t("control.startTranslation")}</span>
      </button>
    </section>
  );
}
