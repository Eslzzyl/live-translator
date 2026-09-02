import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  Copy,
  Download,
  FileText,
  Languages,
  PanelTop,
  Search,
  Trash2,
  X,
} from "lucide-react";
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
  audioLevel = 0,
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
  audioLevel?: number;
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<"trans" | "both" | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollPill, setShowScrollPill] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const filtered = filterTranscript(entries, query);
  const audioSourceLabel = t(AUDIO_SOURCE_KEY[audioSource]);

  // Handle scroll detection
  const handleScroll = useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    const threshold = 60;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= threshold;
    setIsAtBottom(atBottom);
    setShowScrollPill(!atBottom && entries.length > 0);
  }, [entries.length]);

  // Auto-scroll when new entries arrive if user is at bottom
  useEffect(() => {
    if (isAtBottom && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, isAtBottom]);

  const scrollToBottom = () => {
    if (listRef.current) {
      listRef.current.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
      setIsAtBottom(true);
      setShowScrollPill(false);
    }
  };

  const handleCopySingle = async (entry: TranscriptEntry, type: "trans" | "both") => {
    const text = type === "trans" ? entry.translation : `${entry.translation}\n${entry.source}`;
    await navigator.clipboard.writeText(text);
    setCopiedId(entry.id);
    setCopiedType(type);
    setTimeout(() => {
      setCopiedId(null);
      setCopiedType(null);
    }, 1500);
  };

  const isListening = session.state === "listening";

  // Dynamic equalizer bars based on real-time audio energy (3px..14px)
  const h1 =
    isListening && audioLevel > 0.01
      ? Math.max(3, Math.min(13, Math.round(3 + audioLevel * 10)))
      : 3;
  const h2 =
    isListening && audioLevel > 0.01
      ? Math.max(3, Math.min(14, Math.round(3 + audioLevel * 11)))
      : 3;
  const h3 =
    isListening && audioLevel > 0.01
      ? Math.max(3, Math.min(13, Math.round(3 + audioLevel * 10)))
      : 3;
  const h4 =
    isListening && audioLevel > 0.01
      ? Math.max(3, Math.min(11, Math.round(3 + audioLevel * 8)))
      : 3;

  return (
    <section className="workspace-card">
      <div className="workspace-toolbar">
        <div className="toolbar-header">
          <div className="section-title">{t("transcript.title")}</div>
          <div className="section-caption">
            {t("transcript.sessionRecords", { count: entries.length })}
          </div>
        </div>

        <div className="toolbar-actions">
          <div className="search-box-wrap">
            <Search size={14} className="search-icon" aria-hidden="true" />
            <input
              type="text"
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("transcript.searchPlaceholder")}
            />
            {query && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setQuery("")}
                title={t("transcript.clearSearch")}
                aria-label={t("transcript.clearSearch")}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <button
            type="button"
            className={"toolbar-button " + (showOriginal ? "active" : "")}
            onClick={onToggleOriginal}
            title={showOriginal ? t("transcript.hideOriginal") : t("transcript.showOriginal")}
            aria-pressed={showOriginal}
          >
            <Languages size={13} />
            <span>{t("transcript.original")}</span>
          </button>

          <button
            type="button"
            className="toolbar-button"
            onClick={onOpenCaption}
            title={t("settings.openCaption")}
          >
            <PanelTop size={13} />
            <span>{t("settings.openCaption")}</span>
          </button>

          <button
            type="button"
            className="icon-button subtle"
            onClick={onClear}
            title={t("transcript.clear")}
            aria-label={t("transcript.clear")}
            disabled={entries.length === 0}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="transcript-list-wrapper">
        <div className="transcript-list" ref={listRef} onScroll={handleScroll}>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Search size={20} />
              </div>
              <h3>{query ? t("transcript.noMatchTitle") : t("transcript.emptyTitle")}</h3>
              <p>{query ? t("transcript.noMatchDescription") : t("transcript.emptyDescription")}</p>
            </div>
          ) : (
            <div className="transcript-feed">
              {filtered.map((entry) => (
                <article
                  className={`transcript-row ${entry.is_final ? "final" : "partial"}`}
                  key={entry.id}
                >
                  <time className="row-time">{entry.timestamp}</time>
                  <div className="transcript-content">
                    <div className="translation-line">
                      {entry.translation || t("transcript.pending")}
                    </div>
                    {showOriginal && entry.source && (
                      <div className="source-line">{entry.source}</div>
                    )}
                  </div>

                  <div className="row-meta">
                    {!entry.is_final && <span className="live-label">{t("transcript.live")}</span>}
                    <div className="row-actions">
                      <button
                        type="button"
                        className="row-action-btn"
                        onClick={() => void handleCopySingle(entry, "trans")}
                        title={t("transcript.copyTranslation")}
                        aria-label={t("transcript.copyTranslation")}
                      >
                        {copiedId === entry.id && copiedType === "trans" ? (
                          <Check size={13} className="action-success" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                      {showOriginal && entry.source && (
                        <button
                          type="button"
                          className="row-action-btn"
                          onClick={() => void handleCopySingle(entry, "both")}
                          title={t("transcript.copyBoth")}
                          aria-label={t("transcript.copyBoth")}
                        >
                          {copiedId === entry.id && copiedType === "both" ? (
                            <Check size={13} className="action-success" />
                          ) : (
                            <FileText size={13} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {showScrollPill && (
            <button
              type="button"
              className="scroll-bottom-pill"
              onClick={scrollToBottom}
              aria-label={t("transcript.scrollToBottom")}
            >
              <ArrowDown size={13} />
              <span>{t("transcript.scrollToBottom")}</span>
            </button>
          )}
        </div>
      </div>

      <footer className="workspace-footer">
        <div className="footer-status">
          <span
            className={`audio-bars ${isListening ? "active" : ""} ${isListening && audioLevel > 0.02 ? "speaking" : ""}`}
            aria-hidden="true"
          >
            <i style={{ height: `${h1}px` }} />
            <i style={{ height: `${h2}px` }} />
            <i style={{ height: `${h3}px` }} />
            <i style={{ height: `${h4}px` }} />
          </span>
          <span className="status-caption">
            {session.state === "listening"
              ? t("transcript.receiving", { source: audioSourceLabel })
              : t("transcript.notStarted", { source: audioSourceLabel })}
          </span>
        </div>

        <div className="footer-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => void onCopy(filtered)}
            disabled={filtered.length === 0}
          >
            <Copy size={14} />
            <span>{t("transcript.copy")}</span>
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => void onExport(filtered)}
            disabled={filtered.length === 0}
          >
            <Download size={14} />
            <span>{t("transcript.export")}</span>
          </button>
        </div>
      </footer>
    </section>
  );
}
