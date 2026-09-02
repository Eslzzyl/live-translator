import { Moon, Settings, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SessionStatus, Theme } from "../types";
import { AppLogo } from "./AppLogo";

const STATUS_KEY = {
  idle: "header.status.idle",
  connecting: "header.status.connecting",
  listening: "header.status.listening",
  stopping: "header.status.stopping",
  error: "header.status.error",
} as const satisfies Record<SessionStatus["state"], string>;

export function BrandHeader({
  session,
  onSettings,
  theme,
  onToggleTheme,
}: {
  session: SessionStatus;
  onSettings: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const { t } = useTranslation();

  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <AppLogo size={18} />
        </div>
        <div>
          <div className="brand-name">Live Translator</div>
          <div className="brand-subtitle">{t("header.subtitle")}</div>
        </div>
      </div>
      <div className={"connection-status " + session.state}>
        <span className="status-dot" />
        {t(STATUS_KEY[session.state])}
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
