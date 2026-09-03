import { Moon, Settings, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SessionMode, SessionStatus, Theme } from "../types";
import { AppLogo } from "./AppLogo";

const STATUS_KEY = {
  idle: "header.status.idle",
  connecting: "header.status.connecting",
  reconnecting: "header.status.reconnecting",
  listening: "header.status.listening",
  stopping: "header.status.stopping",
  error: "header.status.error",
} as const satisfies Record<SessionStatus["state"], string>;

export function BrandHeader({
  session,
  mode,
  onSettings,
  theme,
  onToggleTheme,
}: {
  session: SessionStatus;
  mode: SessionMode;
  onSettings: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const { t } = useTranslation();

  const statusText =
    session.state === "listening"
      ? mode === "transcription"
        ? t("header.status.transcribing")
        : t(STATUS_KEY[session.state])
      : t(STATUS_KEY[session.state]);

  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <AppLogo size={18} />
        </div>
        <div>
          <div className="brand-name">Live Translator</div>
          <div className="brand-subtitle">
            {mode === "transcription" ? t("header.transcriptionSubtitle") : t("header.subtitle")}
          </div>
        </div>
      </div>
      <div className={"connection-status " + session.state}>
        <span className="status-dot" />
        {statusText}
      </div>
      <button
        className="icon-button topbar-button"
        aria-label={theme === "dark" ? t("header.lightMode") : t("header.darkMode")}
        title={theme === "dark" ? t("header.lightMode") : t("header.darkMode")}
        onClick={onToggleTheme}
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <button
        className="icon-button topbar-button"
        aria-label={t("header.settings")}
        onClick={onSettings}
      >
        <Settings size={18} />
      </button>
    </header>
  );
}
