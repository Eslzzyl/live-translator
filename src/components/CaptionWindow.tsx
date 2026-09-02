import {
  useCallback,
  useLayoutEffect,
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
import type { AppSettings, TranscriptEntry } from "../types";

function useCaptionFlip(entries: TranscriptEntry[]) {
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

function useCaptionLineEntrance(entries: TranscriptEntry[]) {
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

    for (const entry of entries.slice(-3)) {
      if (!entry.translation || introduced.current.has(entry.id)) continue;

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
  }, [entries]);

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
}: {
  settings: AppSettings;
  entries: TranscriptEntry[];
}) {
  const { t } = useTranslation();
  const [windowError, setWindowError] = useState("");
  const registerCaptionLine = useCaptionFlip(entries);
  const registerCaptionEntrance = useCaptionLineEntrance(entries);

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
      {entries.length === 0 ? (
        <p className="caption-empty">{t("caption.waiting")}</p>
      ) : (
        <div className="caption-feed">
          {entries.slice(-3).map((entry, index, arr) => {
            const depth = arr.length - 1 - index;
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
                    (entry.translation ? "has-translation" : "waiting-translation")
                  }
                  data-depth={depth}
                  ref={registerCaptionEntrance(entry.id)}
                >
                  <p className="caption-translation">
                    {entry.translation ? (
                      <SmoothText text={entry.translation} isFinal={entry.is_final} />
                    ) : (
                      <span className="caption-pending-text">{t("caption.pending")}</span>
                    )}
                  </p>
                  {settings.show_original && entry.source && (
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
