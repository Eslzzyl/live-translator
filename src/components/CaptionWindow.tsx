import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefCallback,
} from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isReducedMotion, playLineEntrance } from "../lib/lineEntrance";
import { closeCurrentCaptionWindow } from "../lib/windows";
import { formatAppError } from "../lib/errors";
import { SmoothText } from "./SmoothText";
import {
  isTranscriptionSegment,
  type AppSettings,
  type SessionMode,
  type TranscriptItem,
  type TranscriptionSegment,
} from "../types";

function useCaptionFlip(entries: TranscriptItem[]) {
  const elements = useRef(new Map<string, HTMLDivElement>());
  const previousRects = useRef(new Map<string, DOMRect>());
  const animations = useRef(new Map<string, Animation>());
  const callbacks = useRef(new Map<string, RefCallback<HTMLDivElement>>());

  const register = useCallback((id: string) => {
    const existing = callbacks.current.get(id);
    if (existing) return existing;

    const callback: RefCallback<HTMLDivElement> = (element) => {
      if (element) {
        elements.current.set(id, element);
      } else {
        elements.current.delete(id);
        previousRects.current.delete(id);
        animations.current.get(id)?.cancel();
        animations.current.delete(id);
        callbacks.current.delete(id);
      }
    };
    callbacks.current.set(id, callback);
    return callback;
  }, []);

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();
    const reducedMotion = isReducedMotion();

    for (const [id, element] of elements.current) {
      const nextRect = element.getBoundingClientRect();
      nextRects.set(id, nextRect);
      const previousRect = previousRects.current.get(id);
      const deltaY = previousRect ? previousRect.top - nextRect.top : 0;
      if (!deltaY || reducedMotion || typeof element.animate !== "function") continue;

      animations.current.get(id)?.cancel();
      const animation = element.animate(
        [{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }],
        {
          duration: 420,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        },
      );
      animations.current.set(id, animation);
      void animation.finished
        .then(() => {
          if (animations.current.get(id) === animation) animations.current.delete(id);
        })
        .catch(() => undefined);
    }

    previousRects.current = nextRects;
  }, [entries]);

  useLayoutEffect(
    () => () => {
      animations.current.forEach((animation) => animation.cancel());
    },
    [],
  );

  return register;
}

function useCaptionLineEntrance(entries: TranscriptItem[], mode: SessionMode) {
  const elements = useRef(new Map<string, HTMLElement>());
  const callbacks = useRef(new Map<string, RefCallback<HTMLElement>>());
  const introduced = useRef(new Set<string>());
  const animations = useRef(new Map<string, Animation>());

  const register = useCallback((id: string) => {
    const existing = callbacks.current.get(id);
    if (existing) return existing;

    const callback: RefCallback<HTMLElement> = (element) => {
      if (element) {
        elements.current.set(id, element);
      } else {
        elements.current.delete(id);
        animations.current.get(id)?.cancel();
        animations.current.delete(id);
        callbacks.current.delete(id);
      }
    };
    callbacks.current.set(id, callback);
    return callback;
  }, []);

  useLayoutEffect(() => {
    const reducedMotion = isReducedMotion();

    for (const entry of entries.slice(-4)) {
      const text = isTranscriptionSegment(entry) ? entry.text : entry.translation;
      if (!text || introduced.current.has(entry.id)) continue;

      introduced.current.add(entry.id);
      if (reducedMotion) continue;

      const element = elements.current.get(entry.id);
      if (!element) continue;

      animations.current.get(entry.id)?.cancel();
      const animation = playLineEntrance(element);
      if (!animation) continue;

      animations.current.set(entry.id, animation);
      void animation.finished
        .then(() => {
          if (animations.current.get(entry.id) === animation) {
            animations.current.delete(entry.id);
          }
        })
        .catch(() => undefined);
    }
  }, [entries, mode]);

  useLayoutEffect(
    () => () => {
      animations.current.forEach((animation) => animation.cancel());
      animations.current.clear();
      introduced.current.clear();
    },
    [],
  );

  return register;
}

export function CaptionWindow({
  settings,
  entries,
  mode,
  liveTranscription,
}: {
  settings: AppSettings;
  entries: TranscriptItem[];
  mode: SessionMode;
  liveTranscription: TranscriptionSegment | null;
}) {
  const { t } = useTranslation();
  const [windowError, setWindowError] = useState("");
  const isTranscription = mode === "transcription";
  const modeEntries = useMemo(() => {
    const history = isTranscription
      ? entries.filter((entry) => isTranscriptionSegment(entry) && entry.is_final)
      : entries.filter((entry) => !isTranscriptionSegment(entry));
    return isTranscription && liveTranscription ? [...history, liveTranscription] : history;
  }, [entries, isTranscription, liveTranscription]);
  const registerCaptionLine = useCaptionFlip(modeEntries);
  const registerCaptionEntrance = useCaptionLineEntrance(modeEntries, mode);
  const visibleEntries = modeEntries.slice(-4);

  async function handleClose() {
    setWindowError("");
    try {
      await closeCurrentCaptionWindow();
    } catch (error) {
      setWindowError(formatAppError(error, t, "errors.windowCaptionClose"));
    }
  }

  return (
    <main
      className="caption-window"
      style={
        {
          "--caption-opacity": settings.overlay_opacity,
          "--caption-font-size": String(settings.overlay_font_size) + "px",
        } as CSSProperties
      }
    >
      <div className="caption-titlebar">
        <div className="caption-drag-region" data-tauri-drag-region>
          <span className="caption-drag-hint" aria-hidden="true" />
        </div>
        <button
          className="caption-close-button"
          type="button"
          aria-label={t("caption.close")}
          title={t("caption.close")}
          onClick={() => void handleClose()}
        >
          <X size={16} />
        </button>
      </div>
      {windowError && (
        <p className="caption-window-error" role="alert">
          {windowError}
        </p>
      )}
      {visibleEntries.length === 0 ? (
        <p className="caption-empty">
          {t(isTranscription ? "caption.transcriptionWaiting" : "caption.waiting")}
        </p>
      ) : (
        <div className={`caption-feed ${isTranscription ? "transcription-feed" : ""}`}>
          {visibleEntries.map((entry, index, array) => {
            const depth = array.length - 1 - index;
            const transcriptionEntry = isTranscriptionSegment(entry);
            const text = transcriptionEntry ? entry.text : entry.translation;
            return (
              <div
                className="caption-line-layout"
                key={entry.id}
                ref={registerCaptionLine(entry.id)}
              >
                <article
                  className={
                    "caption-line " +
                    (entry.is_final ? "final " : "partial ") +
                    (text ? "has-text" : "waiting-text") +
                    (transcriptionEntry ? " transcription-caption-line" : "")
                  }
                  data-depth={depth}
                  ref={registerCaptionEntrance(entry.id)}
                >
                  <p
                    className={transcriptionEntry ? "caption-transcription" : "caption-translation"}
                  >
                    {text ? (
                      <SmoothText text={text} isFinal={entry.is_final} />
                    ) : (
                      <span className="caption-pending-text">{t("caption.pending")}</span>
                    )}
                  </p>
                  {!transcriptionEntry &&
                    settings.show_original &&
                    !isTranscriptionSegment(entry) &&
                    entry.source && (
                      <p className="caption-source">
                        <SmoothText text={entry.source} isFinal={entry.is_final} />
                      </p>
                    )}
                </article>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
