import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  Copy,
  Download,
  Languages,
  PanelTop,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { isReducedMotion, playLineEntrance } from "../lib/lineEntrance";
import { filterTranscript } from "../lib/transcript";
import { SmoothText } from "./SmoothText";
import type { AudioSource, SessionStatus, TranscriptEntry } from "../types";

const AUDIO_SOURCE_KEY = {
  system: "audioSources.system",
  microphone: "audioSources.microphone",
  mixed: "audioSources.mixed",
} as const satisfies Record<AudioSource, string>;

type CopyType = "trans" | "both";

const TranscriptRow = memo(function TranscriptRow({
  entry,
  showOriginal,
  isTranslationCopied,
  isBothCopied,
  onCopy,
  pendingText,
  liveText,
  copyTranslationText,
  copyBothText,
  copiedText,
}: {
  entry: TranscriptEntry;
  showOriginal: boolean;
  isTranslationCopied: boolean;
  isBothCopied: boolean;
  onCopy: (entry: TranscriptEntry, type: CopyType) => Promise<void>;
  pendingText: string;
  liveText: string;
  copyTranslationText: string;
  copyBothText: string;
  copiedText: string;
}) {
  const rowRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (isReducedMotion()) return;

    const element = rowRef.current;
    if (!element) return;

    const animation = playLineEntrance(element);

    return () => animation?.cancel();
  }, []);

  return (
    <article ref={rowRef} className={`transcript-row ${entry.is_final ? "final" : "partial"}`}>
      <time className="row-time">{entry.timestamp}</time>
      <div className="transcript-content">
        <div className="translation-line">
          {entry.translation ? (
            <SmoothText text={entry.translation} isFinal={entry.is_final} />
          ) : (
            pendingText
          )}
        </div>
        {showOriginal && entry.source && (
          <div className="source-line">
            <SmoothText text={entry.source} isFinal={entry.is_final} />
          </div>
        )}
      </div>

      <div className="row-meta">
        {!entry.is_final && <span className="live-label">{liveText}</span>}
        <div className="row-actions">
          <button
            type="button"
            className={`row-action-btn ${isTranslationCopied ? "copied" : ""}`}
            onClick={() => void onCopy(entry, "trans")}
            data-tooltip={isTranslationCopied ? copiedText : copyTranslationText}
            aria-label={copyTranslationText}
          >
            {isTranslationCopied ? (
              <Check size={13} className="action-success" />
            ) : (
              <Copy size={13} />
            )}
          </button>
          {showOriginal && entry.source && (
            <button
              type="button"
              className={`row-action-btn ${isBothCopied ? "copied" : ""}`}
              onClick={() => void onCopy(entry, "both")}
              data-tooltip={isBothCopied ? copiedText : copyBothText}
              aria-label={copyBothText}
            >
              {isBothCopied ? (
                <Check size={13} className="action-success" />
              ) : (
                <Languages size={13} />
              )}
            </button>
          )}
        </div>
      </div>
    </article>
  );
});

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
  const [copiedType, setCopiedType] = useState<CopyType | null>(null);
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

  const handleCopySingle = useCallback(async (entry: TranscriptEntry, type: CopyType) => {
    const text = type === "trans" ? entry.translation : `${entry.translation}\n${entry.source}`;
    await navigator.clipboard.writeText(text);
    setCopiedId(entry.id);
    setCopiedType(type);
    setTimeout(() => {
      setCopiedId(null);
      setCopiedType(null);
    }, 1500);
  }, []);

  const isListening = session.state === "listening" || session.state === "reconnecting";

  // Dynamic equalizer bars reflecting speech cadence and frequency contours (3px..14px)
  const isSpeaking = isListening && audioLevel > 0.02;
  const h1 = isSpeaking
    ? Math.max(3, Math.min(12, Math.round(3 + Math.pow(audioLevel, 0.9) * 9)))
    : 3;
  const h2 = isSpeaking
    ? Math.max(3, Math.min(14, Math.round(3 + Math.pow(audioLevel, 0.75) * 11)))
    : 3;
  const h3 = isSpeaking
    ? Math.max(3, Math.min(13, Math.round(3 + Math.pow(audioLevel, 0.85) * 10)))
    : 3;
  const h4 = isSpeaking
    ? Math.max(3, Math.min(11, Math.round(3 + Math.pow(audioLevel, 1.1) * 8)))
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
                <TranscriptRow
                  key={entry.id}
                  entry={entry}
                  showOriginal={showOriginal}
                  isTranslationCopied={copiedId === entry.id && copiedType === "trans"}
                  isBothCopied={copiedId === entry.id && copiedType === "both"}
                  onCopy={handleCopySingle}
                  pendingText={t("transcript.pending")}
                  liveText={t("transcript.live")}
                  copyTranslationText={t("transcript.copyTranslation")}
                  copyBothText={t("transcript.copyBoth")}
                  copiedText={t("transcript.copied")}
                />
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
            {isListening
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
