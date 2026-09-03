import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from "react";
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
import { useVirtualList } from "../lib/virtualList";
import { SmoothText } from "./SmoothText";
import {
  isTranscriptionSegment,
  type AudioSource,
  type SessionMode,
  type SessionStatus,
  type TranscriptEntry,
  type TranscriptItem,
  type TranscriptionSegment,
} from "../types";

const AUDIO_SOURCE_KEY = {
  system: "audioSources.system",
  microphone: "audioSources.microphone",
  mixed: "audioSources.mixed",
} as const satisfies Record<AudioSource, string>;

type CopyType = "trans" | "both";

const TranscriptRow = memo(function TranscriptRow({
  entry,
  mode,
  showOriginal,
  isTranslationCopied,
  isBothCopied,
  onCopy,
  pendingText,
  liveText,
  copyTranslationText,
  copyBothText,
  copiedText,
  measureRef,
}: {
  entry: TranscriptItem;
  mode: SessionMode;
  showOriginal: boolean;
  isTranslationCopied: boolean;
  isBothCopied: boolean;
  onCopy: (entry: TranscriptItem, type: CopyType) => Promise<void>;
  pendingText: string;
  liveText: string;
  copyTranslationText: string;
  copyBothText: string;
  copiedText: string;
  measureRef: (key: string) => (element: HTMLElement | null) => void;
}) {
  const rowRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (isReducedMotion()) return;

    const element = rowRef.current;
    if (!element) return;

    const animation = playLineEntrance(element);

    return () => animation?.cancel();
  }, []);

  if (mode === "transcription" && isTranscriptionSegment(entry)) {
    return (
      <article
        ref={(element) => {
          rowRef.current = element;
          measureRef(entry.id)(element);
        }}
        className={`transcript-row transcription-row ${entry.is_final ? "final" : "partial"}`}
      >
        <time className="row-time">{entry.timestamp}</time>
        <div className="transcript-content">
          <div className="transcription-line">
            <SmoothText text={entry.text || pendingText} isFinal={entry.is_final} />
          </div>
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
          </div>
        </div>
      </article>
    );
  }

  const translationEntry = entry as TranscriptEntry;
  return (
    <article
      ref={(element) => {
        rowRef.current = element;
        measureRef(entry.id)(element);
      }}
      className={`transcript-row ${translationEntry.is_final ? "final" : "partial"}`}
    >
      <time className="row-time">{translationEntry.timestamp}</time>
      <div className="transcript-content">
        <div className="translation-line">
          {translationEntry.translation ? (
            <SmoothText text={translationEntry.translation} isFinal={translationEntry.is_final} />
          ) : (
            pendingText
          )}
        </div>
        {showOriginal && translationEntry.source && (
          <div className="source-line">
            <SmoothText text={translationEntry.source} isFinal={translationEntry.is_final} />
          </div>
        )}
      </div>

      <div className="row-meta">
        {!translationEntry.is_final && <span className="live-label">{liveText}</span>}
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
          {showOriginal && translationEntry.source && (
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
  liveTranscription,
  mode,
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
  entries: TranscriptItem[];
  liveTranscription: TranscriptionSegment | null;
  mode: SessionMode;
  session: SessionStatus;
  audioLevel?: number;
  audioSource: AudioSource;
  showOriginal: boolean;
  onToggleOriginal: () => void;
  onOpenCaption: () => void;
  onClear: () => void;
  onCopy: (entries: TranscriptItem[]) => void;
  onExport: (entries: TranscriptItem[]) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<CopyType | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newContentCount, setNewContentCount] = useState(0);
  const previousHistoryLength = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);
  const audioSourceLabel = t(AUDIO_SOURCE_KEY[audioSource]);
  const isTranscription = mode === "transcription";
  const liveEntry = isTranscription ? liveTranscription : undefined;
  const historyEntries = useMemo(
    () =>
      isTranscription
        ? entries.filter((entry) => isTranscriptionSegment(entry) && entry.is_final)
        : entries.filter((entry) => !isTranscriptionSegment(entry)),
    [entries, isTranscription],
  );
  const filtered = useMemo(
    () => filterTranscript(historyEntries, deferredQuery),
    [deferredQuery, historyEntries],
  );
  const liveMatches = liveEntry && filterTranscript([liveEntry], deferredQuery).length > 0;
  const { containerRef, handleScroll, measureRef, totalSize, virtualItems } = useVirtualList(
    filtered,
    (entry) => entry.id,
  );

  const setListRef = useCallback(
    (element: HTMLDivElement | null) => {
      listRef.current = element;
      containerRef.current = element;
    },
    [containerRef],
  );

  const onListScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      handleScroll(event);
      const list = event.currentTarget;
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= 60;
      setIsAtBottom(atBottom);
      if (atBottom) setNewContentCount(0);
    },
    [handleScroll],
  );

  useEffect(() => {
    const delta = historyEntries.length - previousHistoryLength.current;
    if (!isAtBottom && delta > 0) {
      setNewContentCount((count) => count + delta);
    }
    previousHistoryLength.current = historyEntries.length;
  }, [historyEntries.length, isAtBottom]);

  useEffect(() => {
    if (isAtBottom && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [historyEntries.length, filtered.length, isAtBottom, totalSize]);

  const scrollToBottom = () => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      setIsAtBottom(true);
      setNewContentCount(0);
    }
  };

  const handleCopySingle = useCallback(async (entry: TranscriptItem, type: CopyType) => {
    const text = isTranscriptionSegment(entry)
      ? entry.text
      : type === "trans"
        ? entry.translation
        : `${entry.translation}\n${entry.source}`;
    await navigator.clipboard.writeText(text);
    setCopiedId(entry.id);
    setCopiedType(type);
    setTimeout(() => {
      setCopiedId(null);
      setCopiedType(null);
    }, 1500);
  }, []);

  const isListening = session.state === "listening" || session.state === "reconnecting";
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
  const titleKey = isTranscription ? "transcript.transcriptionTitle" : "transcript.title";
  const recordsKey = isTranscription
    ? "transcript.transcriptionSessionRecords"
    : "transcript.sessionRecords";

  return (
    <section className="workspace-card">
      <div className="workspace-toolbar">
        <div className="toolbar-header">
          <div className="section-title">{t(titleKey)}</div>
          <div className="section-caption">{t(recordsKey, { count: historyEntries.length })}</div>
        </div>

        <div className="toolbar-actions">
          <div className="search-box-wrap">
            <Search size={14} className="search-icon" aria-hidden="true" />
            <input
              type="text"
              className="search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t(
                isTranscription
                  ? "transcript.transcriptionSearchPlaceholder"
                  : "transcript.searchPlaceholder",
              )}
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

          {!isTranscription && (
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
          )}

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
            title={isTranscription ? t("transcript.transcriptionClear") : t("transcript.clear")}
            aria-label={
              isTranscription ? t("transcript.transcriptionClear") : t("transcript.clear")
            }
            disabled={entries.length === 0}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {isTranscription && liveEntry && liveMatches && isTranscriptionSegment(liveEntry) && (
        <div className="live-segment-bar" role="status" aria-live="polite">
          <span className="live-segment-indicator" aria-hidden="true" />
          <span className="live-segment-label">{t("transcript.live")}</span>
          <span className="live-segment-text">{liveEntry.text || t("transcript.pending")}</span>
        </div>
      )}

      <div className="transcript-list-wrapper">
        <div className="transcript-list" ref={setListRef} onScroll={onListScroll}>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Search size={20} />
              </div>
              <h3>
                {query
                  ? t("transcript.noMatchTitle")
                  : t(
                      isTranscription
                        ? "transcript.transcriptionEmptyTitle"
                        : "transcript.emptyTitle",
                    )}
              </h3>
              <p>
                {query
                  ? t("transcript.noMatchDescription")
                  : t(
                      isTranscription
                        ? "transcript.transcriptionEmptyDescription"
                        : "transcript.emptyDescription",
                    )}
              </p>
            </div>
          ) : (
            <div className="transcript-virtual-content" style={{ height: `${totalSize}px` }}>
              {virtualItems.map((item) => {
                const entry = filtered[item.index];
                return (
                  <div
                    className="transcript-virtual-row"
                    key={item.key}
                    style={{ transform: `translateY(${item.start}px)` }}
                  >
                    <TranscriptRow
                      entry={entry}
                      mode={mode}
                      showOriginal={showOriginal}
                      isTranslationCopied={copiedId === entry.id && copiedType === "trans"}
                      isBothCopied={copiedId === entry.id && copiedType === "both"}
                      onCopy={handleCopySingle}
                      pendingText={t("transcript.pending")}
                      liveText={t("transcript.live")}
                      copyTranslationText={t(
                        isTranscription
                          ? "transcript.transcriptionCopy"
                          : "transcript.copyTranslation",
                      )}
                      copyBothText={t("transcript.copyBoth")}
                      copiedText={t("transcript.copied")}
                      measureRef={measureRef}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {!isAtBottom && historyEntries.length > 0 && (
            <button
              type="button"
              className="scroll-bottom-pill"
              onClick={scrollToBottom}
              aria-label={t("transcript.scrollToBottom")}
            >
              <ArrowDown size={13} />
              <span>
                {newContentCount > 0
                  ? t("transcript.newContent", { count: newContentCount })
                  : t("transcript.scrollToBottom")}
              </span>
            </button>
          )}
        </div>
      </div>

      <footer className="workspace-footer">
        <div className="footer-status">
          <span
            className={`audio-bars ${isListening ? "active" : ""} ${isSpeaking ? "speaking" : ""}`}
            aria-hidden="true"
          >
            <i style={{ height: `${h1}px` }} />
            <i style={{ height: `${h2}px` }} />
            <i style={{ height: `${h3}px` }} />
            <i style={{ height: `${h4}px` }} />
          </span>
          <span className="status-caption">
            {isListening
              ? t(isTranscription ? "transcript.transcriptionReceiving" : "transcript.receiving", {
                  source: audioSourceLabel,
                })
              : t(
                  isTranscription ? "transcript.transcriptionNotStarted" : "transcript.notStarted",
                  {
                    source: audioSourceLabel,
                  },
                )}
          </span>
          {isTranscription && (
            <span className="session-retention-note">{t("transcript.transcriptionNotSaved")}</span>
          )}
        </div>

        <div className="footer-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => onCopy(filtered)}
            disabled={filtered.length === 0}
          >
            <Copy size={14} />
            <span>{t(isTranscription ? "transcript.transcriptionCopy" : "transcript.copy")}</span>
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => onExport(filtered)}
            disabled={filtered.length === 0}
          >
            <Download size={14} />
            <span>
              {t(isTranscription ? "transcript.transcriptionExport" : "transcript.export")}
            </span>
          </button>
        </div>
      </footer>
    </section>
  );
}
