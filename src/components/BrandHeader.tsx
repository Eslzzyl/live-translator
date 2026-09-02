import { Languages, Moon, Settings, Sun } from "lucide-react";
import type { SessionStatus, Theme } from "../types";

const STATUS_LABEL: Record<SessionStatus["state"], string> = {
  idle: "准备就绪",
  connecting: "正在连接",
  listening: "正在翻译",
  stopping: "正在停止",
  error: "连接异常",
};

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
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <Languages size={18} />
        </div>
        <div>
          <div className="brand-name">Live Translator</div>
          <div className="brand-subtitle">实时字幕翻译</div>
        </div>
      </div>
      <div className={"connection-status " + session.state}>
        <span className="status-dot" />
        {STATUS_LABEL[session.state]}
      </div>
      <button
        className="icon-button topbar-button"
        aria-label={theme === "dark" ? "切换浅色模式" : "切换深色模式"}
        title={theme === "dark" ? "切换浅色模式" : "切换深色模式"}
        onClick={onToggleTheme}
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <button className="icon-button topbar-button" aria-label="设置" onClick={onSettings}>
        <Settings size={18} />
      </button>
    </header>
  );
}
