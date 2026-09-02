import { LoaderCircle, Mic, MonitorSpeaker, Play, Square } from "lucide-react";
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
  const isRunning = session.active;

  return (
    <section className="control-panel">
      <div className="control-group source-control">
        <span className="control-label">音频来源</span>
        <div className="source-select-wrap">
          {settings.audio_source === "system" ? <MonitorSpeaker size={17} /> : <Mic size={17} />}
          <SelectMenu<AudioSource>
            className="source-select"
            value={settings.audio_source}
            options={AUDIO_SOURCE_OPTIONS}
            onChange={(value) => onChange({ audio_source: value })}
            ariaLabel="音频来源"
          />
        </div>
      </div>
      <div className="control-divider" />
      <div className="language-control">
        <span className="control-label">语言</span>
        <div className="language-pair">
          <span className="language-pill">自动识别</span>
          <span className="language-arrow">→</span>
          <div className="language-select-wrap">
            <SelectMenu
              className="language-select"
              value={settings.target_language}
              options={LANGUAGE_OPTIONS}
              onChange={(value) => onChange({ target_language: value })}
              ariaLabel="目标语言"
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
        {isRunning ? "停止翻译" : "开始翻译"}
      </button>
    </section>
  );
}
