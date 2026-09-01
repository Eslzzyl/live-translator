import { useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { closeCurrentCaptionWindow } from "../lib/windows";
import type { AppSettings, TranscriptEntry } from "../types";

export function CaptionWindow({
  settings,
  entries,
}: {
  settings: AppSettings;
  entries: TranscriptEntry[];
}) {
  const [windowError, setWindowError] = useState("");

  async function handleClose() {
    setWindowError("");
    try {
      await closeCurrentCaptionWindow();
    } catch (error) {
      setWindowError(`浮窗关闭失败：${String(error)}`);
    }
  }

  return (
    <main
      className="caption-window"
      style={{
        "--caption-opacity": settings.overlay_opacity,
        "--caption-font-size": String(settings.overlay_font_size) + "px",
      } as CSSProperties}
    >
      <div className="caption-titlebar">
        <div className="caption-drag-region" data-tauri-drag-region>
          <span className="caption-drag-hint" aria-hidden="true" />
        </div>
        <button
          className="caption-close-button"
          type="button"
          aria-label="关闭字幕浮窗"
          title="关闭字幕浮窗"
          onClick={() => void handleClose()}
        >
          <X size={16} />
        </button>
      </div>
      {windowError && <p className="caption-window-error" role="alert">{windowError}</p>}
      {entries.length === 0 ? (
        <p className="caption-empty">等待字幕……</p>
      ) : entries.slice(-4).map((entry) => (
        <article className={"caption-line " + (entry.is_final ? "final" : "partial")} key={entry.id}>
          <p className="caption-translation">{entry.translation || "……"}</p>
          {settings.show_original && <p className="caption-source">{entry.source}</p>}
        </article>
      ))}
    </main>
  );
}
