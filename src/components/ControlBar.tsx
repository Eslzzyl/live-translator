import { LoaderCircle, Mic, MonitorSpeaker, Play, Square } from "lucide-react";
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

  return (
    <section className="control-panel">
      <div className="control-group source-control">
        <span className="control-label">{t("control.audioSource")}</span>
        <div className="source-select-wrap">
          {settings.audio_source === "system" ? <MonitorSpeaker size={17} /> : <Mic size={17} />}
          <SelectMenu<AudioSource>
            className="source-select"
            value={settings.audio_source}
            options={audioOptions}
            onChange={(value) => onChange({ audio_source: value })}
            ariaLabel={t("control.audioSource")}
          />
        </div>
      </div>
      <div className="control-divider" />
      <div className="language-control">
        <span className="control-label">{t("control.language")}</span>
        <div className="language-pair">
          <span className="language-pill">{t("language.auto")}</span>
          <span className="language-arrow">→</span>
          <div className="language-select-wrap">
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
        className={
          "primary-button session-button " + (session.state === "listening" ? "active" : "")
        }
        onClick={onToggleSession}
      >
        {session.state === "connecting" ? (
          <LoaderCircle className="spin" size={17} />
        ) : isRunning ? (
          <Square size={15} fill="currentColor" />
        ) : (
          <Play size={17} fill="currentColor" />
        )}
        {isRunning ? t("control.stopTranslation") : t("control.startTranslation")}
      </button>
    </section>
  );
}
