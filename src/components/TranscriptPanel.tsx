import { useState } from "react";
import { Copy, Download, Eye, EyeOff, ListFilter, PanelTop, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { filterTranscript } from "../lib/transcript";
import type { AudioSource, SessionStatus, TranscriptEntry } from "../types";

const AUDIO_SOURCE_KEY = {
  system: "audioSources.system",
  microphone: "audioSources.microphone",
  mixed: "audioSources.mixed",
} as const satisfies Record<AudioSource, string>;

export function TranscriptPanel({
  entries,
  session,
  audioSource,
  showOriginal,
  onToggleOriginal,
  onOpenCaption,
  onClear,
  onCopy,
  onExport,
}: {
  entries: TranscriptEntry[];
  session: SessionStatus;
  audioSource: AudioSource;
  showOriginal: boolean;
  onToggleOriginal: () => void;
  onOpenCaption: () => void;
  onClear: () => void;
  onCopy: (entries: TranscriptEntry[]) => void;
  onExport: (entries: TranscriptEntry[]) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const filtered = filterTranscript(entries, query);
  const audioSourceLabel = t(AUDIO_SOURCE_KEY[audioSource]);

  return (
    <section className="workspace-card">
      <div className="workspace-toolbar">
        <div>
          <div className="section-title">{t("transcript.title")}</div>
          <div className="section-caption">
            {t("transcript.sessionRecords", { count: entries.length })}
          </div>
        </div>
        <div className="toolbar-actions">
          <label className="search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("transcript.searchPlaceholder")}
            />
          </label>
          <button
            className="toolbar-button"
            onClick={onToggleOriginal}
            title={showOriginal ? t("transcript.hideOriginal") : t("transcript.showOriginal")}
          >
            {showOriginal ? <Eye size={16} /> : <EyeOff size={16} />}
            {t("transcript.original")}
          </button>
          <button className="toolbar-button" onClick={onOpenCaption}>
            <PanelTop size={16} />
            {t("settings.openCaption")}
          </button>
          <button
            className="icon-button subtle"
            onClick={onClear}
            aria-label={t("transcript.clear")}
            title={t("transcript.clear")}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="transcript-list">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <ListFilter size={21} />
            </div>
            <h2>{query ? t("transcript.noMatchTitle") : t("transcript.emptyTitle")}</h2>
            <p>{query ? t("transcript.noMatchDescription") : t("transcript.emptyDescription")}</p>
          </div>
        ) : (
          filtered.map((entry) => (
            <article
              className={"transcript-row " + (entry.is_final ? "final" : "partial")}
              key={entry.id}
            >
              <time>{entry.timestamp}</time>
              <div className="transcript-content">
                <div className="translation-line">
                  {entry.translation || t("transcript.pending")}
                </div>
                {showOriginal && <div className="source-line">{entry.source}</div>}
              </div>
              {!entry.is_final && <span className="live-label">{t("transcript.live")}</span>}
            </article>
          ))
        )}
      </div>
      <footer className="workspace-footer">
        <div className="footer-status">
          <span className={"audio-bars " + (session.state === "listening" ? "active" : "")}>
            <i />
            <i />
            <i />
            <i />
          </span>
          {session.state === "listening"
            ? t("transcript.receiving", { source: audioSourceLabel })
            : t("transcript.notStarted", { source: audioSourceLabel })}
        </div>
        <div className="footer-actions">
          <button
            className="text-button"
            onClick={() => void onCopy(filtered)}
            disabled={filtered.length === 0}
          >
            <Copy size={15} />
            {t("transcript.copy")}
          </button>
          <button
            className="text-button"
            onClick={() => void onExport(filtered)}
            disabled={filtered.length === 0}
          >
            <Download size={15} />
            {t("transcript.export")}
          </button>
        </div>
      </footer>
    </section>
  );
}
